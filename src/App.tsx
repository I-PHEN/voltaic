import { useState, useRef, useEffect } from 'react'
import styles from './components/Layout.module.css'
import nodeStyles from './components/Node.module.css'
import inspectorStyles from './components/Inspector.module.css'
import { devices } from './data/devices'
import { generateWorkflowSteps, type WorkflowStep } from './data/workflow'
import { generateScriptAndChecklist, generateSCPITerminalLogsFromScript, type SCPILogLine } from './data/scriptGenerator'
import { fetchPlan, planToWorkflowSteps } from './data/planClient'
import { transcribeAudio } from './data/voiceClient'

interface CanvasNode {
  id: string;
  deviceId: string;
  name: string;
  type: string;
  x: number;
  y: number;
  properties: Record<string, any>;
}

interface Connection {
  id: string;
  fromId: string;
  toId: string;
}

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  type?: 'step' | 'summary';
  stepType?: 'thinking' | 'add_device' | 'connect' | 'summary';
  thinkingSteps?: Array<{
    text: string;
    type: 'thinking' | 'add_device' | 'connect' | 'summary';
    status: 'pending' | 'running' | 'completed';
  }>;
  isThinkingComplete?: boolean;
}

const getDeviceColor = (type: string) => {
  switch (type) {
    case 'Spectrum Analyzer':
      return '#c084fc' // Purple
    case 'Oscilloscope':
      return '#22d3ee' // Cyan
    case 'Power Supply':
      return '#f97316' // Orange
    case 'Function Generator':
      return '#34d399' // Green
    case 'Vector Network Analyzer':
      return '#3b82f6' // Blue
    case 'Step Attenuator':
      return '#fbbf24' // Amber
    default:
      return '#64748b'
  }
}

const getFormattedTime = () => {
  const now = new Date()
  let hours = now.getHours()
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  hours = hours ? hours : 12
  return `${hours}:${minutes} ${ampm}`
}

function App() {
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [isStaging, setIsStaging] = useState(false)
  const activeTimersRef = useRef<number[]>([])
  const activeThinkingMessageIdRef = useRef<string | null>(null)
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({})
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('voltaic-theme') as 'dark' | 'light') || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('voltaic-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    document.documentElement.classList.add('theme-switching')
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.remove('theme-switching')
      })
    })
  }
  
  // Dragging states
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const dragStartPosRef = useRef({ x: 0, y: 0 })

  // Script and Terminal States
  const [generatedScript, setGeneratedScript] = useState<string | null>(null)
  const [generatedChecklist, setGeneratedChecklist] = useState<string[] | null>(null)
  const [generatedRationale, setGeneratedRationale] = useState<string[] | null>(null)
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false)
  const [isScriptStaging, setIsScriptStaging] = useState(false)
  
  const [terminalLogs, setTerminalLogs] = useState<SCPILogLine[]>([])
  const [isTerminalOpen, setIsTerminalOpen] = useState(false)
  const [isTerminalRunning, setIsTerminalRunning] = useState(false)
  const terminalTimersRef = useRef<number[]>([])
  const terminalEndRef = useRef<HTMLDivElement>(null)
  
  // Selection states
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // UI/UX Improvement States
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({})
  const [activeExecutingNodeId, setActiveExecutingNodeId] = useState<string | null>(null)
  const [terminalSpeed, setTerminalSpeed] = useState<number>(250)
  const [copiedScript, setCopiedScript] = useState(false)
  const [copiedChecklist, setCopiedChecklist] = useState(false)
  const [simulateError, setSimulateError] = useState(false)


  
  // Voice state (Groq Whisper transcription)
  const [isListening, setIsListening] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const mediaStreamRef = useRef<MediaStream | null>(null)

  // Collapsible & expandable panel states
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false)
  const [isRightCollapsed, setIsRightCollapsed] = useState(false)
  const [isRightExpanded, setIsRightExpanded] = useState(false)
  
  const messageEndRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom of chat
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Interruption safety cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeTimersRef.current) {
        activeTimersRef.current.forEach((t) => clearTimeout(t))
      }
      if (terminalTimersRef.current) {
        terminalTimersRef.current.forEach((t) => clearTimeout(t))
      }
      // Release the microphone if a recording is still active.
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Auto-expand textarea height on input changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [chatInput])

  // Global key listener to delete selected node
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          handleDeleteNode(selectedNodeId)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId])

  // Handle start dragging a node card with pointer events (touch & mouse)
  const handleNodePointerDown = (e: React.PointerEvent, nodeId: string) => {
    // Ignore drags if click originated from the delete button
    if ((e.target as HTMLElement).classList.contains(nodeStyles.deleteButton)) {
      return
    }

    e.preventDefault()
    const canvas = canvasRef.current
    const node = nodes.find((n) => n.id === nodeId)
    
    if (canvas && node) {
      // Capture pointer so events keep firing even if drag leaves the card boundaries
      e.currentTarget.setPointerCapture(e.pointerId)
      setDraggingNodeId(nodeId)
      
      const rect = canvas.getBoundingClientRect()
      const startX = e.clientX - rect.left
      const startY = e.clientY - rect.top

      dragOffsetRef.current = {
        x: startX - node.x,
        y: startY - node.y
      }

      dragStartPosRef.current = {
        x: e.clientX,
        y: e.clientY
      }
    }
  }

  // Hook to track pointer updates during a drag
  useEffect(() => {
    if (!draggingNodeId) return

    const handlePointerMove = (e: PointerEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const currentX = e.clientX - rect.left
      const currentY = e.clientY - rect.top

      // Absolute correct positioning maths (relative to drag start position inside canvas)
      let newX = currentX - dragOffsetRef.current.x
      let newY = currentY - dragOffsetRef.current.y

      // Clamp node coordinates inside canvas bounds (190px width, 128px height)
      const maxLimitX = rect.width - 190
      const maxLimitY = rect.height - 128

      newX = Math.max(10, Math.min(newX, maxLimitX - 10))
      newY = Math.max(10, Math.min(newY, maxLimitY - 10))

      setNodes((prev) =>
        prev.map((node) =>
          node.id === draggingNodeId
            ? { ...node, x: newX, y: newY }
            : node
        )
      )
    }

    const handlePointerUp = (e: PointerEvent) => {
      // Release pointer capture if any element captured it
      try {
        const target = e.target as HTMLElement
        if (target && typeof target.releasePointerCapture === 'function') {
          target.releasePointerCapture(e.pointerId)
        }
      } catch (err) {
        // ignore safety failures on release pointer capture
      }

      // Check if it is a pure click (has not moved more than 3px) or a drag
      const deltaX = Math.abs(e.clientX - dragStartPosRef.current.x)
      const deltaY = Math.abs(e.clientY - dragStartPosRef.current.y)
      const hasMoved = deltaX > 3 || deltaY > 3

      if (!hasMoved) {
        // Pure click/tap: Select the node to open inspector properties
        setSelectedNodeId(draggingNodeId)
      }

      setDraggingNodeId(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [draggingNodeId])

  // Clear canvas
  const handleClear = () => {
    setIsStaging(false)
    setIsTyping(false)
    if (activeTimersRef.current && activeTimersRef.current.length > 0) {
      activeTimersRef.current.forEach((t) => clearTimeout(t))
      activeTimersRef.current = []
    }
    if (terminalTimersRef.current && terminalTimersRef.current.length > 0) {
      terminalTimersRef.current.forEach((t) => clearTimeout(t))
      terminalTimersRef.current = []
    }
    setNodes([])
    setConnections([])
    setSelectedNodeId(null)
    setValidationErrors({})
    setActiveExecutingNodeId(null)
  }

  // Reset chat and clear canvas
  const handleNewChat = () => {
    setIsStaging(false)
    setIsTyping(false)
    if (activeTimersRef.current && activeTimersRef.current.length > 0) {
      activeTimersRef.current.forEach((t) => clearTimeout(t))
      activeTimersRef.current = []
    }
    if (terminalTimersRef.current && terminalTimersRef.current.length > 0) {
      terminalTimersRef.current.forEach((t) => clearTimeout(t))
      terminalTimersRef.current = []
    }
    setMessages([])
    setNodes([])
    setConnections([])
    setSelectedNodeId(null)
    setValidationErrors({})
    setActiveExecutingNodeId(null)
  }


  // Scroll to bottom of terminal when logs change
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLogs])

  const handleRunWorkflow = () => {
    // 1. Clear any active terminal timers and reset executing node
    if (terminalTimersRef.current.length > 0) {
      terminalTimersRef.current.forEach((t) => clearTimeout(t))
      terminalTimersRef.current = []
    }
    setActiveExecutingNodeId(null)

    setIsTerminalOpen(true)
    setIsTerminalRunning(true)
    setTerminalLogs([])

    const logsToPrint = generateSCPITerminalLogsFromScript(generatedScript, simulateError)

    
    let currentActiveNodeId: string | null = null

    logsToPrint.forEach((log, idx) => {
      const timerId = window.setTimeout(() => {
        // Remove current timerId from tracking list
        terminalTimersRef.current = terminalTimersRef.current.filter((t) => t !== timerId)

        // Determine executing node by parsing log.text
        if (log.text.startsWith('CONNECT')) {
          let matchedDeviceId = ''
          if (log.text.includes('192.168.8.101')) matchedDeviceId = 'nge100'
          else if (log.text.includes('192.168.8.102')) matchedDeviceId = 'fpc1500'
          else if (log.text.includes('192.168.8.103')) matchedDeviceId = 'rtb24'
          else if (log.text.includes('192.168.8.104')) matchedDeviceId = 'hmf2550'
          
          if (matchedDeviceId) {
            const matchedNode = nodes.find((n) => n.deviceId === matchedDeviceId)
            if (matchedNode) {
              currentActiveNodeId = matchedNode.id
              setActiveExecutingNodeId(matchedNode.id)
            }
          }
        } else if (log.text.startsWith('✓') || log.text.startsWith('>>') || log.text.startsWith('⚠')) {
          currentActiveNodeId = null
          setActiveExecutingNodeId(null)
        }

        // Live parameter updates based on SCPI command string
        if (currentActiveNodeId && log.text.startsWith('-> ')) {
          const scpiCmd = log.text.substring(3).trim()
          
          setNodes((prevNodes) =>
            prevNodes.map((n) => {
              if (n.id !== currentActiveNodeId) return n
              
              const updatedProperties = { ...n.properties }
              
              if (n.deviceId === 'nge100') {
                if (scpiCmd.startsWith('VOLT ')) {
                  updatedProperties.voltage = parseFloat(scpiCmd.substring(5))
                } else if (scpiCmd.startsWith('CURR ')) {
                  updatedProperties.current = parseFloat(scpiCmd.substring(5))
                } else if (scpiCmd.startsWith('OUTP ')) {
                  updatedProperties.output = scpiCmd.substring(5) === 'ON'
                }
              } else if (n.deviceId === 'fpc1500') {
                if (scpiCmd.startsWith('FREQ:CENT ')) {
                  // Convert Hz back to MHz
                  updatedProperties.centerFreq = parseFloat(scpiCmd.substring(10)) / 1e6
                } else if (scpiCmd.startsWith('FREQ:SPAN ')) {
                  // Convert Hz back to MHz
                  updatedProperties.span = parseFloat(scpiCmd.substring(10)) / 1e6
                } else if (scpiCmd.startsWith('DISP:TRAC:Y:RLEV ')) {
                  updatedProperties.refLevel = parseFloat(scpiCmd.substring(17))
                }
              } else if (n.deviceId === 'rtb24') {
                if (scpiCmd.startsWith('TIM:SCAL ')) {
                  // Convert seconds back to ms
                  updatedProperties.timebase = parseFloat(scpiCmd.substring(9)) * 1e3
                } else if (scpiCmd.startsWith('CHAN1:SCAL ')) {
                  updatedProperties.ch1Scale = parseFloat(scpiCmd.substring(11))
                } else if (scpiCmd.startsWith('TRIG:A:SOUR ')) {
                  updatedProperties.trigger = scpiCmd.substring(12)
                }
              } else if (n.deviceId === 'hmf2550') {
                if (scpiCmd.startsWith('FREQ ')) {
                  // Convert Hz back to kHz
                  updatedProperties.frequency = parseFloat(scpiCmd.substring(5)) / 1e3
                } else if (scpiCmd.startsWith('VOLT ')) {
                  updatedProperties.amplitude = parseFloat(scpiCmd.substring(5))
                } else if (scpiCmd.startsWith('OUTP ')) {
                  updatedProperties.output = scpiCmd.substring(5) === 'ON'
                }
              }

              return { ...n, properties: updatedProperties }
            })
          )
        }

        setTerminalLogs((prev) => [...prev, log])

        // Check if this was the last line
        if (idx === logsToPrint.length - 1) {
          setIsTerminalRunning(false)
          setActiveExecutingNodeId(null)
        }
      }, idx * terminalSpeed)

      terminalTimersRef.current.push(timerId)
    })
  }


  // Delete Node & Associated Connections
  const handleDeleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId))
    setConnections((prev) => prev.filter((c) => c.fromId !== nodeId && c.toId !== nodeId))
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null)
    }
    setValidationErrors((prev) => {
      const next = { ...prev }
      delete next[nodeId]
      return next
    })
  }

  // Edit node properties
  const handlePropertyChange = (nodeId: string, key: string, value: any) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              properties: {
                ...n.properties,
                [key]: value
              }
            }
          : n
      )
    )
    setValidationErrors((prev) => {
      if (!prev[nodeId]) return prev
      const next = { ...prev }
      delete next[nodeId]
      return next
    })
  }


  // Copy Code to Clipboard
  const handleCopyCode = (codeText: string) => {
    navigator.clipboard.writeText(codeText).then(() => {
      alert("SCPI Calibration Script copied to clipboard!")
    }).catch((err) => {
      console.error("Failed to copy code: ", err)
    })
  }

  // Download Code to .py File
  const handleDownloadCode = (codeText: string) => {
    const blob = new Blob([codeText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'voltaic_calibration.py'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Speech Recognition Toggle
  // Voice input via mic recording -> Groq Whisper transcription.
  const toggleSpeech = async () => {
    // Already recording -> stop; the recorder's onstop handler does the transcription.
    if (isListening) {
      mediaRecorderRef.current?.stop()
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      alert("Microphone recording isn't supported in this browser. Try Chrome, Edge, or Safari.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        // Release the microphone.
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
        mediaStreamRef.current = null
        setIsListening(false)

        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size === 0) return

        setIsTranscribing(true)
        try {
          const text = await transcribeAudio(blob)
          if (text) setChatInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))
        } catch (err) {
          console.error('Transcription failed:', err)
          alert('Transcription failed. Check your connection / API key and try again.')
        } finally {
          setIsTranscribing(false)
        }
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setIsListening(true)
    } catch (err) {
      console.error('Microphone access failed:', err)
      alert('Could not access the microphone. Please grant permission and try again.')
    }
  }

  // Run Parameter Limits Validation
  const handleValidate = () => {
    if (nodes.length === 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: `val_${Date.now()}`,
          sender: 'assistant',
          text: "⚠️ **Calibration Validation Failed:**\n\nCanvas is empty. Add instruments before validating.",
          timestamp: getFormattedTime()
        }
      ])
      return
    }

    const report: string[] = []
    let hasErrors = false
    const errors: Record<string, string[]> = {}

    nodes.forEach((node) => {
      const nodeErrors: string[] = []
      if (node.deviceId === 'nge100') {
        const v = parseFloat(node.properties.voltage ?? 0)
        const c = parseFloat(node.properties.current ?? 0)
        if (v < 0 || v > 32) {
          const errMsg = `Voltage limit error: Configured voltage of **${v} V** exceeds physical channel hardware thresholds (0.00V - 32.00V).`
          report.push(`- ❌ **NGE100**: ${errMsg}`)
          nodeErrors.push(errMsg)
          hasErrors = true
        }
        if (c < 0.05 || c > 3.0) {
          const errMsg = `Current limit error: Limit of **${c} A** exceeds socket limits (0.05A - 3.00A).`
          report.push(`- ❌ **NGE100**: ${errMsg}`)
          nodeErrors.push(errMsg)
          hasErrors = true
        }
      } else if (node.deviceId === 'fpc1500') {
        const cf = parseFloat(node.properties.centerFreq ?? 0)
        const span = parseFloat(node.properties.span ?? 0)
        if (cf < 0.005 || cf > 1500) {
          const errMsg = `RF range error: Center Frequency **${cf} MHz** is out of bounds (0.005 MHz - 1500.00 MHz).`
          report.push(`- ❌ **FPC1500**: ${errMsg}`)
          nodeErrors.push(errMsg)
          hasErrors = true
        }
        if (span < 0.00001 || span > 1500) {
          const errMsg = `Span scale error: Sweep span of **${span} MHz** is out of bounds (10 Hz - 1500.00 MHz).`
          report.push(`- ❌ **FPC1500**: ${errMsg}`)
          nodeErrors.push(errMsg)
          hasErrors = true
        }
      } else if (node.deviceId === 'rtb24') {
        const scale = parseFloat(node.properties.ch1Scale ?? 0)
        const tb = parseFloat(node.properties.timebase ?? 0)
        if (scale < 0.001 || scale > 10) {
          const errMsg = `Scale error: Vertical setting of **${scale} V** is out of bounds (1 mV - 10.00 V).`
          report.push(`- ❌ **RTB24**: ${errMsg}`)
          nodeErrors.push(errMsg)
          hasErrors = true
        }
        if (tb < 0.000001 || tb > 500000) {
          const errMsg = `Horizontal sweep error: Timebase of **${tb} ms** exceeds horizontal sweep thresholds.`
          report.push(`- ❌ **RTB24**: ${errMsg}`)
          nodeErrors.push(errMsg)
          hasErrors = true
        }
      } else if (node.deviceId === 'hmf2550') {
        const freq = parseFloat(node.properties.frequency ?? 0)
        const amp = parseFloat(node.properties.amplitude ?? 0)
        if (freq < 0.00001 || freq > 50000) {
          const errMsg = `Frequency error: Reference frequency **${freq} kHz** is out of bounds (0.00001 kHz - 50000.00 kHz).`
          report.push(`- ❌ **HMF2550**: ${errMsg}`)
          nodeErrors.push(errMsg)
          hasErrors = true
        }
        if (amp < 0.001 || amp > 10) {
          const errMsg = `Amplitude error: Waveform amplitude of **${amp} Vpp** exceeds hardware limits.`
          report.push(`- ❌ **HMF2550**: ${errMsg}`)
          nodeErrors.push(errMsg)
          hasErrors = true
        }
      }

      if (nodeErrors.length > 0) {
        errors[node.id] = nodeErrors
      }
    })

    setValidationErrors(errors)

    if (hasErrors) {
      setMessages((prev) => [
        ...prev,
        {
          id: `val_${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ **Calibration Validation Failed:**\n\n${report.join('\n')}\n\n*Fix these parameters in the Inspector before generating the python calibration script.*`,
          timestamp: getFormattedTime()
        }
      ])
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: `val_${Date.now()}`,
          sender: 'assistant',
          text: "✅ **Calibration Validation Succeeded:**\n\n- All instrument parameters are within safe hardware thresholds.\n- Virtual ports are successfully linked.\n\n*Ready to compile python SCPI script.*",
          timestamp: getFormattedTime()
        }
      ])
    }
  }


  // Dynamic Python SCPI Code Generator with Staged Reveal Narration
  const handleGenerateScript = () => {
    if (nodes.length === 0) return

    // 1. Interruption safety: clear any previous active timers
    if (activeTimersRef.current.length > 0) {
      activeTimersRef.current.forEach((t) => clearTimeout(t))
      activeTimersRef.current = []
    }

    setIsScriptStaging(true)
    setIsTyping(false)

    const { narrationSteps, script, checklist, rationale } = generateScriptAndChecklist(nodes)
    
    // Map initial thinking steps
    const initialThinkingSteps: Array<{
      text: string
      type: 'thinking' | 'add_device' | 'connect' | 'summary'
      status: 'pending' | 'running' | 'completed'
    }> = narrationSteps.map((s, sIdx) => ({
      text: s.label,
      type: 'thinking' as const,
      status: sIdx === 0 ? 'running' as const : 'pending' as const
    }))

    const replyMsgId = `script_reply_${Date.now()}`
    activeThinkingMessageIdRef.current = replyMsgId

    setMessages((prev) => [
      ...prev,
      {
        id: replyMsgId,
        sender: 'assistant',
        text: '',
        timestamp: getFormattedTime(),
        thinkingSteps: initialThinkingSteps,
        isThinkingComplete: false
      }
    ])

    let cumulativeDelay = 0

    const updateScriptStepStatus = (stepIdx: number, status: 'completed' | 'running') => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== replyMsgId) return msg
          const updatedSteps = msg.thinkingSteps ? [...msg.thinkingSteps] : []
          
          if (status === 'completed') {
            if (updatedSteps[stepIdx]) {
              updatedSteps[stepIdx].status = 'completed'
            }
            if (updatedSteps[stepIdx + 1]) {
              updatedSteps[stepIdx + 1].status = 'running'
            }
          } else {
            if (updatedSteps[stepIdx]) {
              updatedSteps[stepIdx].status = 'running'
            }
          }
          
          return {
            ...msg,
            thinkingSteps: updatedSteps
          }
        })
      )
    }

    narrationSteps.forEach((_, idx) => {
      // 600ms staged reveals
      cumulativeDelay += 600

      const timerId = window.setTimeout(() => {
        // Remove current timerId from tracking list
        activeTimersRef.current = activeTimersRef.current.filter((t) => t !== timerId)

        // Update step status
        updateScriptStepStatus(idx, 'completed')

        // Check if this was the last step
        if (idx === narrationSteps.length - 1) {
          setIsScriptStaging(false)
          setGeneratedScript(script)
          setGeneratedChecklist(checklist)
          setGeneratedRationale(rationale)
          setIsScriptModalOpen(true)

          // Post final summary chat message with rationale
          const rationaleSummary = rationale.length > 0
            ? "\n\n**AI Design Decisions & Rationale:**\n" + rationale.map(r => `• ${r}`).join('\n')
            : ''

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== replyMsgId) return msg
              return {
                ...msg,
                text: `Script ready — see the panel for your SCPI workflow and checklist.${rationaleSummary}`,
                isThinkingComplete: true
              }
            })
          )
        }
      }, cumulativeDelay)

      activeTimersRef.current.push(timerId)
    })
  }

  // Run simulated staged workflow execution
  const runStagedWorkflow = (steps: WorkflowStep[], existingMsgId?: string) => {
    // 1. Interruption safety: clear any previous active timers
    if (activeTimersRef.current.length > 0) {
      activeTimersRef.current.forEach((t) => clearTimeout(t))
      activeTimersRef.current = []
    }

    setIsStaging(true)
    setIsTyping(false)
    
    const replyMsgId = existingMsgId || `reply_${Date.now()}`
    activeThinkingMessageIdRef.current = replyMsgId

    if (!existingMsgId) {
      // Map initial thinking steps
      const initialThinkingSteps: Array<{
        text: string
        type: 'thinking' | 'add_device' | 'connect' | 'summary'
        status: 'pending' | 'running' | 'completed'
      }> = steps
        .filter(s => s.type !== 'summary')
        .map((s, sIdx) => {
          let text = s.label || ''
          if (s.type === 'thinking') text = s.label || 'Initializing workspace layout configuration...'
          return {
            text,
            type: s.type,
            status: sIdx === 0 ? 'running' as const : 'pending' as const
          }
        })

      setMessages((prev) => [
        ...prev,
        {
          id: replyMsgId,
          sender: 'assistant',
          text: '',
          timestamp: getFormattedTime(),
          thinkingSteps: initialThinkingSteps,
          isThinkingComplete: false
        }
      ])
    }

    // Dictionary to map temporary sequence IDs to actual unique runtime IDs
    const idMapping: Record<string, string> = {}
    let cumulativeDelay = 0

    const updateStepStatus = (stepIdx: number, status: 'completed' | 'running') => {
      const targetIdx = existingMsgId ? stepIdx + 1 : stepIdx
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== replyMsgId) return msg
          const updatedSteps = msg.thinkingSteps ? [...msg.thinkingSteps] : []
          
          if (status === 'completed') {
            if (updatedSteps[targetIdx]) {
              updatedSteps[targetIdx].status = 'completed'
            }
            if (updatedSteps[targetIdx + 1]) {
              updatedSteps[targetIdx + 1].status = 'running'
            }
          } else {
            if (updatedSteps[targetIdx]) {
              updatedSteps[targetIdx].status = 'running'
            }
          }
          
          return {
            ...msg,
            thinkingSteps: updatedSteps
          }
        })
      )
    }

    steps.forEach((step, idx) => {
      let stepDelay = 600
      if (step.type === 'thinking') {
        stepDelay = 800
      }
      
      cumulativeDelay += stepDelay

      const timerId = window.setTimeout(() => {
        // Remove current timerId from tracking list
        activeTimersRef.current = activeTimersRef.current.filter((t) => t !== timerId)

        if (step.type === 'thinking') {
          updateStepStatus(idx, 'completed')
        } else if (step.type === 'add_device') {
          const tempId = step.payload?.fromId || `temp_${Date.now()}`
          const resolvedId = `${step.payload?.deviceId}_${Date.now()}`
          idMapping[tempId] = resolvedId

          const newNode: CanvasNode = {
            id: resolvedId,
            deviceId: step.payload?.deviceId || '',
            name: step.payload?.nodeName || '',
            type: step.payload?.nodeType || '',
            x: step.payload?.x || 50,
            y: step.payload?.y || 100,
            properties: step.payload?.properties || {}
          }

          setNodes((prev) => [...prev, newNode])
          updateStepStatus(idx, 'completed')

        } else if (step.type === 'connect') {
          const resolvedFrom = idMapping[step.payload?.fromId || '']
          const resolvedTo = idMapping[step.payload?.toId || '']

          if (resolvedFrom && resolvedTo) {
            const newConn: Connection = {
              id: `${resolvedFrom}-${resolvedTo}`,
              fromId: resolvedFrom,
              toId: resolvedTo
            }
            setConnections((prev) => [...prev, newConn])
          }
          updateStepStatus(idx, 'completed')

        } else if (step.type === 'summary') {
          setIsStaging(false)

          const summaryText = step.payload?.summaryText || ''
          if (summaryText === 'CLEAR_CANVAS') {
            handleClear()
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== replyMsgId) return msg
                return {
                  ...msg,
                  text: "Workflow canvas cleared successfully. Let me know what you want to measure next!",
                  isThinkingComplete: true
                }
              })
            )
          } else {
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== replyMsgId) return msg
                return {
                  ...msg,
                  text: summaryText,
                  isThinkingComplete: true
                }
              })
            )
          }
        }
      }, cumulativeDelay)

      activeTimersRef.current.push(timerId)
    })
  }

  const processIntent = async (intentText: string) => {
    setIsTyping(true)

    // 1. Immediately add the assistant's reply bubble in a thinking state:
    const replyMsgId = `reply_${Date.now()}`
    activeThinkingMessageIdRef.current = replyMsgId

    setMessages((prev) => [
      ...prev,
      {
        id: replyMsgId,
        sender: 'assistant',
        text: '',
        timestamp: getFormattedTime(),
        thinkingSteps: [
          { text: 'Analyzing instrument setup and intent...', type: 'thinking', status: 'running' }
        ],
        isThinkingComplete: false
      }
    ])

    let steps: WorkflowStep[]
    let isConversational = false
    let summaryMessage = ''

    try {
      const plan = await fetchPlan(intentText, nodes)
      if (!plan.devices || plan.devices.length === 0) {
        isConversational = true
        summaryMessage = plan.summary
      } else {
        steps = planToWorkflowSteps(plan)
      }
    } catch (err) {
      console.warn('AI planner unavailable, using offline planner:', err)
      const offlineSteps = generateWorkflowSteps(intentText)
      
      const hasDevices = offlineSteps.some((s) => s.type === 'add_device')
      if (!hasDevices) {
        isConversational = true
        const summaryStep = offlineSteps.find((s) => s.type === 'summary')
        summaryMessage = summaryStep?.payload?.summaryText || "I couldn't identify a hardware plan for that request."
      } else {
        steps = offlineSteps
      }
    }

    if (isConversational) {
      setIsTyping(false)
      // Update the immediate replyMsgId to be conversational instead of appending a new message:
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== replyMsgId) return msg
          return {
            ...msg,
            text: summaryMessage,
            thinkingSteps: [],
            isThinkingComplete: true
          }
        })
      )
      return
    }

    // Since we have devices, let's map the workflow steps to thinking steps
    const initialThinkingSteps: Array<{
      text: string
      type: 'thinking' | 'add_device' | 'connect' | 'summary'
      status: 'pending' | 'running' | 'completed'
    }> = [
      { text: 'Analyzing instrument setup and intent...', type: 'thinking', status: 'completed' },
      ...steps!.filter(s => s.type !== 'summary').map((s) => {
        let text = s.label || ''
        if (s.type === 'thinking') text = s.label || 'Initializing workspace layout configuration...'
        return {
          text,
          type: s.type,
          status: 'pending' as const
        }
      })
    ]

    // Set the first layout step to running
    if (initialThinkingSteps[1]) {
      initialThinkingSteps[1].status = 'running'
    }

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== replyMsgId) return msg
        return {
          ...msg,
          thinkingSteps: initialThinkingSteps
        }
      })
    )

    // Clear canvas before placing new device layouts to prevent overlapping coordinates
    const hasAdditions = steps!.some((s) => s.type === 'add_device')
    if (hasAdditions) {
      handleClear()
    }

    runStagedWorkflow(steps!, replyMsgId)
  }


  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    
    const userMsg = chatInput.trim()
    setMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        sender: 'user',
        text: userMsg,
        timestamp: getFormattedTime()
      }
    ])
    setChatInput('')
    processIntent(userMsg)
  }

  const handleSuggestionClick = (suggestion: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        sender: 'user',
        text: suggestion,
        timestamp: getFormattedTime()
      }
    ])
    processIntent(suggestion)
  }

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains(styles.connectionsSvg)) {
      setSelectedNodeId(null)
    }
  }

  // Local helper to parse and render message text with markdown code block formatting
  const renderMessageText = (text: string) => {
    if (!text.includes('```')) {
      return text.split('\n').map((line, i) => {
        let content: React.ReactNode = line
        if (line.includes('**')) {
          const subParts = line.split('**')
          content = subParts.map((sp, idx) => (idx % 2 === 1 ? <strong key={idx}>{sp}</strong> : sp))
        }
        return (
          <p key={i} style={{ margin: '4px 0' }}>
            {content}
          </p>
        )
      })
    }

    const parts = text.split('```')
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        const codeContent = part.replace(/^(python|bash|javascript|json|html)\n/, '')
        return (
          <div key={index} style={{ margin: '8px 0' }}>
            <div className={styles.codeHeader}>
              <span>Python SCPI</span>
              <div className={styles.codeActions}>
                <button
                  type="button"
                  className={styles.codeActionBtn}
                  onClick={() => handleCopyCode(codeContent)}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className={styles.codeActionBtn}
                  onClick={() => handleDownloadCode(codeContent)}
                >
                  Download
                </button>
              </div>
            </div>
            <pre
              style={{
                backgroundColor: 'var(--bg-code)',
                border: '1px solid var(--border-color)',
                borderTop: 'none',
                borderBottomLeftRadius: '8px',
                borderBottomRightRadius: '8px',
                padding: '10px 12px',
                margin: 0,
                overflowX: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                lineHeight: '1.4',
                color: 'var(--color-code-text)',
                whiteSpace: 'pre'
              }}
            >
              <code>{codeContent}</code>
            </pre>
          </div>
        )
      }

      return part.split('\n').map((line, i) => {
        let content: React.ReactNode = line
        if (line.includes('**')) {
          const subParts = line.split('**')
          content = subParts.map((sp, idx) => (idx % 2 === 1 ? <strong key={idx}>{sp}</strong> : sp))
        }
        return (
          <p key={i} style={{ margin: '4px 0' }}>
            {content}
          </p>
        )
      })
    })
  }

  // Selected Node metadata helper
  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  // Render Visual LCD Display inside the node cards
  const renderNodeScreen = (node: CanvasNode) => {
    switch (node.deviceId) {
      case 'fpc1500': {
        const center = node.properties.centerFreq ?? 500
        const span = node.properties.span ?? 10
        return (
          <div className={nodeStyles.nodeScreen}>
            <svg className={nodeStyles.screenSvg}>
              <defs>
                <pattern id="screen-grid" width="8" height="8" patternUnits="userSpaceOnUse">
                  <path d="M 8 0 L 0 0 0 8" fill="none" className={nodeStyles.screenGrid} />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#screen-grid)" />
              {/* Peak wave path */}
              <path d="M 4 24 L 30 24 L 50 24 L 70 24 L 80 18 L 90 4 L 100 18 L 110 24 L 166 24" />
            </svg>
            <div className={nodeStyles.screenLabel}>
              CF: {center} MHz | SPAN: {span} MHz
            </div>
          </div>
        )
      }
      case 'rtb24': {
        const scale = node.properties.ch1Scale ?? 1.0
        const tb = node.properties.timebase ?? 1.0
        return (
          <div className={nodeStyles.nodeScreen}>
            <svg className={nodeStyles.screenSvg}>
              <defs>
                <pattern id="scope-grid" width="8" height="8" patternUnits="userSpaceOnUse">
                  <path d="M 8 0 L 0 0 0 8" fill="none" className={nodeStyles.screenGrid} />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#scope-grid)" />
              {/* Sine Wave */}
              <path d="M 4 16 C 30 0, 50 32, 85 16 C 120 0, 140 32, 166 16" />
            </svg>
            <div className={nodeStyles.screenLabel}>
              CH1: {scale}V | TB: {tb}ms
            </div>
          </div>
        )
      }
      case 'nge100': {
        const voltage = parseFloat(node.properties.voltage ?? 12.0)
        const current = parseFloat(node.properties.current ?? 1.5)
        const active = node.properties.output ?? false
        return (
          <div className={nodeStyles.nodeScreen}>
            <div className={nodeStyles.screenReadout}>
              <span>{voltage.toFixed(2)} V</span>
              <span>{current.toFixed(2)} A</span>
            </div>
            <div className={nodeStyles.screenLabel}>
              CH1: OUTPUT {active ? 'ON' : 'OFF'}
            </div>
          </div>
        )
      }
      case 'hmf2550': {
        const freq = node.properties.frequency ?? 10.0
        const amp = node.properties.amplitude ?? 2.0
        return (
          <div className={nodeStyles.nodeScreen}>
            <div className={nodeStyles.screenReadout} style={{ color: '#00e676', textShadow: '0 0 4px rgba(0, 230, 118, 0.4)' }}>
              <span>{freq} kHz</span>
              <span>{amp} Vpp</span>
            </div>
            <div className={nodeStyles.screenLabel}>SINE WAVE ACTIVE</div>
          </div>
        )
      }
      default:
        return (
          <div className={nodeStyles.nodeScreen}>
            <div className={nodeStyles.screenReadout} style={{ color: '#0091ff', textShadow: '0 0 4px rgba(0, 145, 255, 0.4)' }}>
              <span>READY</span>
            </div>
            <div className={nodeStyles.screenLabel}>SIMULATOR ONLINE</div>
          </div>
        )
    }
  }

  // Render Property Inspector panel controls
  const renderInspector = (node: CanvasNode) => {
    switch (node.deviceId) {
      case 'nge100':
        return (
          <>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Channel 1 Voltage</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  step="0.1"
                  className={inspectorStyles.textInput}
                  value={node.properties.voltage ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'voltage', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>V</span>
              </div>
            </div>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Channel 1 Current Limit</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  step="0.05"
                  className={inspectorStyles.textInput}
                  value={node.properties.current ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'current', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>A</span>
              </div>
            </div>
            <div className={inspectorStyles.switchRow}>
              <label className={inspectorStyles.switchLabel}>Output Power</label>
              <button
                type="button"
                className={`${inspectorStyles.switchBtn} ${
                  node.properties.output ? inspectorStyles.switchBtnActive : ''
                }`}
                onClick={() => handlePropertyChange(node.id, 'output', !node.properties.output)}
              >
                <span
                  className={`${inspectorStyles.switchHandle} ${
                    node.properties.output ? inspectorStyles.switchHandleActive : ''
                  }`}
                />
              </button>
            </div>
            <p className={inspectorStyles.descriptionText}>
              The NGE100 is an isolated channels power supply. Maximum voltage output per channel is 32V. Keep values below target limits.
            </p>
          </>
        )
      case 'fpc1500':
        return (
          <>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Center Frequency</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  className={inspectorStyles.textInput}
                  value={node.properties.centerFreq ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'centerFreq', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>MHz</span>
              </div>
            </div>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Span</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  className={inspectorStyles.textInput}
                  value={node.properties.span ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'span', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>MHz</span>
              </div>
            </div>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Reference Level</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  className={inspectorStyles.textInput}
                  value={node.properties.refLevel ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'refLevel', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>dBm</span>
              </div>
            </div>
            <p className={inspectorStyles.descriptionText}>
              The FPC1500 spectrum analyzer tracks signal harmonics and power levels. Set center frequency to align with signal interest bands.
            </p>
          </>
        )
      case 'rtb24':
        return (
          <>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Vertical Scale (CH1)</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  step="0.1"
                  className={inspectorStyles.textInput}
                  value={node.properties.ch1Scale ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'ch1Scale', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>V/div</span>
              </div>
            </div>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Horizontal Timebase</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  step="0.1"
                  className={inspectorStyles.textInput}
                  value={node.properties.timebase ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'timebase', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>ms/div</span>
              </div>
            </div>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Trigger Source</label>
              <select
                className={inspectorStyles.selectInput}
                value={node.properties.trigger ?? 'CH1'}
                onChange={(e) => handlePropertyChange(node.id, 'trigger', e.target.value)}
              >
                <option value="CH1">Channel 1</option>
                <option value="CH2">Channel 2</option>
                <option value="EXT">External</option>
              </select>
            </div>
            <p className={inspectorStyles.descriptionText}>
              The RTB24 oscilloscope shows waveform sweeps. Make sure timebase is set narrow enough to capture transient peaks.
            </p>
          </>
        )
      case 'hmf2550':
        return (
          <>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Frequency</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  className={inspectorStyles.textInput}
                  value={node.properties.frequency ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'frequency', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>kHz</span>
              </div>
            </div>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Amplitude</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  step="0.1"
                  className={inspectorStyles.textInput}
                  value={node.properties.amplitude ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'amplitude', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>Vpp</span>
              </div>
            </div>
            <p className={inspectorStyles.descriptionText}>
              Function generator supplying sine, triangle, or square waves up to 50 MHz.
            </p>
          </>
        )
      default:
        return (
          <p className={inspectorStyles.descriptionText}>
            No custom parameter settings available for this secondary device. It runs under mock diagnostic validation check values.
          </p>
        )
    }
  }

  return (
    <div className={styles.appContainer}>
      {/* LEFT SIDEBAR: Branding & Static Instrument List */}
      <aside
        className={styles.sidebar}
        style={{
          width: isLeftCollapsed ? '0px' : '220px',
          minWidth: isLeftCollapsed ? '0px' : '220px',
          borderRightWidth: isLeftCollapsed ? '0px' : '1px'
        }}
      >
        <div style={{ width: '220px', height: '100%', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div className={styles.logoSection}>
            <div className={styles.logoIcon}>
              <img src="/favicon.svg" style={{ width: '16px', height: '16px' }} alt="Voltaic Logo" />
            </div>
            <div className={styles.logoTextContainer}>
              <h1 className={styles.logoText}>VOLTAIC</h1>
              <span className={styles.logoSubtitle}>R&S Workflow Builder</span>
            </div>
            <button
              className={styles.sidebarCollapseBtn}
              onClick={() => setIsLeftCollapsed(true)}
              title="Collapse Instruments"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
          </div>

          <h2 className={styles.sidebarTitle}>Instruments</h2>
          <div className={styles.deviceList}>
            {devices.map((device) => {
              const typeColor = getDeviceColor(device.type)
              return (
                <div key={device.id} className={styles.deviceCard} style={{ cursor: 'default' }}>
                  <span className={styles.deviceName}>{device.name}</span>
                  <span className={styles.deviceBadge}>
                    <span
                      className={styles.badgeDot}
                      style={{
                        backgroundColor: typeColor,
                        boxShadow: `0 0 6px ${typeColor}80`
                      }}
                    />
                    {device.type}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </aside>

      {/* CENTER CANVAS PANEL */}
      <main className={styles.canvasContainer}>
        {/* TOOLBAR */}
        <div className={styles.toolbar} style={{ justifyContent: 'space-between' }}>
          <div>
            <button 
              className={styles.toolbarButton} 
              onClick={toggleTheme}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {generatedScript && (
              <button 
                className={styles.toolbarButton} 
                onClick={() => setIsScriptModalOpen(true)}
                disabled={isStaging || isScriptStaging}
              >
                View Last Script
              </button>
            )}
            <button 
              className={styles.toolbarButton} 
              onClick={handleClear}
              disabled={isStaging || isScriptStaging}
            >
              Clear
            </button>
            <button 
              className={styles.toolbarButton} 
              onClick={handleValidate}
              disabled={isStaging || isScriptStaging}
            >
              Validate
            </button>
            <button
              className={`${styles.toolbarButton} ${styles.toolbarButtonPrimary}`}
              onClick={handleGenerateScript}
              disabled={nodes.length === 0 || isStaging || isScriptStaging}
            >
              Generate Script
            </button>
          </div>
        </div>

        {/* CANVAS SURFACE */}
        <div
          ref={canvasRef}
          className={`${styles.canvasSurface} ${draggingNodeId ? styles.canvasSurfaceDragging : ''}`}
          onClick={handleCanvasClick}
        >
          {isLeftCollapsed && (
            <button
              className={styles.floatingExpandTabLeft}
              onClick={(e) => {
                e.stopPropagation()
                setIsLeftCollapsed(false)
              }}
              title="Show Instruments"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          )}

          {isRightCollapsed && (
            <button
              className={styles.floatingExpandTabRight}
              onClick={(e) => {
                e.stopPropagation()
                setIsRightCollapsed(false)
              }}
              title="Show Assistant"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
          )}

          {/* SVG CONNECTIONS OVERLAY */}
          <svg className={styles.connectionsSvg}>
            {connections.map((conn) => {
              const fromNode = nodes.find((n) => n.id === conn.fromId)
              const toNode = nodes.find((n) => n.id === conn.toId)
              if (!fromNode || !toNode) return null

              const x1 = fromNode.x + 190 // Output Socket
              const y1 = fromNode.y + 64  // Card Center Height (128px / 2)
              const x2 = toNode.x         // Input Socket
              const y2 = toNode.y + 64

              // Curved Bezier calculation
              const cp1x = x1 + 50
              const cp2x = x2 - 50

              return (
                <path
                  key={conn.id}
                  className={isTerminalRunning ? styles.activeFlow : ''}
                  d={`M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`}
                  stroke="var(--color-primary)"
                  strokeWidth="2.5"
                  fill="none"
                  style={{ filter: 'drop-shadow(0 0 3px rgba(0, 145, 255, 0.35))' }}
                />
              )

            })}
          </svg>

          {nodes.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>
                <img src="/favicon.svg" style={{ width: '28px', height: '28px' }} alt="Voltaic Logo" />
              </div>
              <div className={styles.emptyStateText}>
                Describe a test flow to begin
              </div>
            </div>
          ) : (
            nodes.map((node) => {
              const borderLeftColor = getDeviceColor(node.type)
              const hasInputConnection = connections.some((c) => c.toId === node.id)
              const hasOutputConnection = connections.some((c) => c.fromId === node.id)
              const isSelected = selectedNodeId === node.id
              
              const isDragging = draggingNodeId === node.id
              const hasErrors = validationErrors[node.id] && validationErrors[node.id].length > 0
              const isExecuting = activeExecutingNodeId === node.id
              const executingClass = isExecuting ? (nodeStyles[`nodeCardExecuting_${node.deviceId}`] || nodeStyles.nodeCardExecuting) : ''

              let leftPortTitle = "Input Port Socket"
              let rightPortTitle = "Output Port Socket"
              if (node.deviceId === 'fpc1500') {
                leftPortTitle = "RF Input Socket (50 Ω)"
                rightPortTitle = "Ch1 Direct Sweep Output Port"
              } else if (node.deviceId === 'rtb24') {
                leftPortTitle = "Ch1 Analog Input Port (1 MΩ)"
                rightPortTitle = "Ch1 Aux Trigger/Output Port"
              } else if (node.deviceId === 'nge100') {
                leftPortTitle = "Power Supply Input Port"
                rightPortTitle = "Ch1 Power Output Port (32V/3A max)"
              } else if (node.deviceId === 'hmf2550') {
                leftPortTitle = "Function Generator Input Port"
                rightPortTitle = "Ch1 Reference Wave Output (50 Ω)"
              }

              return (
                <div
                  key={node.id}
                  className={`${nodeStyles.nodeCard} ${isSelected ? nodeStyles.nodeCardSelected : ''} ${
                    isDragging ? nodeStyles.nodeCardDragging : ''
                  } ${hasErrors ? nodeStyles.nodeCardError : ''} ${executingClass}`}
                  style={{
                    transform: `translate(${node.x}px, ${node.y}px)`
                  }}
                  onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                  onClick={(e) => {
                    e.stopPropagation()
                  }}
                >
                  {/* Visual Left Connection Port */}
                  <div
                    className={`${nodeStyles.port} ${nodeStyles.portLeft} ${
                      hasInputConnection ? nodeStyles.portConnected : ''
                    }`}
                    title={leftPortTitle}
                  />

                  <div className={nodeStyles.nodeHeader}>
                    <span className={nodeStyles.nodeName}>{node.name}</span>
                    <span className={nodeStyles.nodeType}>{node.type}</span>
                    
                    {hasErrors && (
                      <div 
                        className={nodeStyles.validationBadge}
                        title={validationErrors[node.id].join('\n')}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedNodeId(node.id)
                        }}
                      >
                        ⚠
                      </div>
                    )}

                    <button
                      className={nodeStyles.deleteButton}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteNode(node.id)
                      }}
                      title="Remove instrument"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Render Visual instrument screen */}
                  {renderNodeScreen(node)}

                  <div className={nodeStyles.nodeBody}>
                    <div className={nodeStyles.statusIndicator}>
                      <span
                        className={`${nodeStyles.statusDot} ${nodeStyles.statusDotActive}`}
                        style={{
                          backgroundColor: borderLeftColor,
                          boxShadow: `0 0 6px ${borderLeftColor}`
                        }}
                      />
                      <span>Active</span>
                    </div>
                  </div>

                  {/* Visual Right Connection Port */}
                  <div
                    className={`${nodeStyles.port} ${nodeStyles.portRight} ${
                      hasOutputConnection ? nodeStyles.portConnected : ''
                    }`}
                    title={rightPortTitle}
                  />

                </div>
              )
            })
          )}
        </div>
      </main>

      {/* RIGHT PANEL: Chat Assistant OR Property Inspector */}
      <section
        className={styles.chatPanel}
        style={{
          width: isRightCollapsed ? '0px' : (isRightExpanded ? '550px' : '320px'),
          minWidth: isRightCollapsed ? '0px' : (isRightExpanded ? '550px' : '320px'),
          borderLeftWidth: isRightCollapsed ? '0px' : '1px'
        }}
      >
        <div
          style={{
            width: isRightExpanded ? '550px' : '320px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {selectedNode ? (
            /* PROPERTY INSPECTOR VIEW */
            <div className={inspectorStyles.inspectorContainer}>
              <div className={inspectorStyles.inspectorHeader}>
                <button
                  className={inspectorStyles.backButton}
                  onClick={() => setSelectedNodeId(null)}
                  title="Back to assistant"
                >
                  ◀
                </button>
                <div className={inspectorStyles.headerTitles}>
                  <span className={inspectorStyles.title}>Properties: {selectedNode.name}</span>
                  <span className={inspectorStyles.subtitle}>{selectedNode.type}</span>
                </div>
                <div className={styles.headerActions}>
                  <button
                    onClick={() => setIsRightExpanded(!isRightExpanded)}
                    className={styles.headerActionBtn}
                    title={isRightExpanded ? "Restore width" : "Expand width"}
                  >
                    {isRightExpanded ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => setIsRightCollapsed(true)}
                    className={styles.headerActionBtn}
                    title="Collapse panel"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>
                </div>
              </div>
              <div className={inspectorStyles.inspectorContent}>
                {renderInspector(selectedNode)}
              </div>
            </div>
          ) : (
            /* ASSISTANT CHAT VIEW */
            <>
              <div className={styles.chatTitle}>
                <span className={styles.chatIndicator} />
                <span>Voltaic Assistant</span>
                {messages.length > 0 && (
                  <button onClick={handleNewChat} className={styles.newChatButton}>
                    New Chat
                  </button>
                )}
                <div className={styles.headerActions}>
                  <button
                    onClick={() => setIsRightExpanded(!isRightExpanded)}
                    className={styles.headerActionBtn}
                    title={isRightExpanded ? "Restore width" : "Expand width"}
                  >
                    {isRightExpanded ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => setIsRightCollapsed(true)}
                    className={styles.headerActionBtn}
                    title="Collapse panel"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className={styles.messageList}>
                {messages.map((msg) => {
                  if (msg.type === 'step') {
                    return (
                      <div key={msg.id} className={styles.stepLogItem}>
                        <div className={styles.stepLogIcon}>
                          {msg.stepType === 'add_device' ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="5" x2="12" y2="19"></line>
                              <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                          )}
                        </div>
                        <div className={styles.stepLogText}>{msg.text}</div>
                      </div>
                    )
                  }

                  const hasThinking = msg.sender === 'assistant' && msg.thinkingSteps && msg.thinkingSteps.length > 0
                  const isExpanded = hasThinking ? (expandedThoughts[msg.id] !== undefined ? expandedThoughts[msg.id] : !msg.isThinkingComplete) : false

                  return (
                    <div
                      key={msg.id}
                      className={`${styles.messageItem} ${
                        msg.sender === 'user' ? styles.messageUser : styles.messageAssistant
                      }`}
                      style={{ flexDirection: 'column', alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}
                    >
                      {hasThinking && (
                        <div className={styles.thinkingBox} style={{ maxWidth: '100%' }}>
                          <div 
                            className={styles.thinkingHeader} 
                            onClick={() => {
                              setExpandedThoughts(prev => ({
                                ...prev,
                                [msg.id]: !isExpanded
                              }))
                            }}
                          >
                            <div className={styles.thinkingHeaderLeft}>
                              {!msg.isThinkingComplete ? (
                                <span style={{ 
                                  display: 'inline-block',
                                  width: '8px', 
                                  height: '8px', 
                                  borderRadius: '50%', 
                                  backgroundColor: 'var(--color-warning)',
                                  animation: 'pulseScale 1s ease-in-out infinite alternate'
                                }} />
                              ) : (
                                <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>✓</span>
                              )}
                              <span>
                                {!msg.isThinkingComplete 
                                  ? "Thinking Process..." 
                                  : `Thinking Process (Completed)`}
                              </span>
                            </div>
                            <span 
                              className={`${styles.thinkingChevron} ${isExpanded ? styles.thinkingChevronExpanded : ''}`}
                            >
                              ▼
                            </span>
                          </div>
                          
                          {isExpanded && (
                            <div className={styles.thinkingBody}>
                              {msg.thinkingSteps?.map((step, sIdx) => (
                                <div key={sIdx} className={styles.thinkingStepItem}>
                                  <div className={styles.stepIndicator}>
                                    {step.status === 'completed' && (
                                      <span className={styles.indicator_completed}>✓</span>
                                    )}
                                    {step.status === 'running' && (
                                      <span className={styles.indicator_running} />
                                    )}
                                    {step.status === 'pending' && (
                                      <span className={styles.indicator_pending} />
                                    )}
                                  </div>
                                  <span className={
                                    step.status === 'completed' 
                                      ? styles.stepStatus_completed 
                                      : step.status === 'running' 
                                      ? styles.stepStatus_running 
                                      : styles.stepStatus_pending
                                  }>
                                    {step.text}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {msg.text && (
                        <div
                          className={`${styles.messageBubble} ${
                            msg.sender === 'user'
                              ? styles.bubbleUser
                              : msg.type === 'summary'
                              ? styles.bubbleSummary
                              : styles.bubbleAssistant
                          }`}
                        >
                          {renderMessageText(msg.text)}
                        </div>
                      )}
                      <span className={styles.messageTimestamp}>{msg.timestamp}</span>
                    </div>
                  )
                })}
                
                {/* Typing indicator removed as requested */}
                
                {/* Suggestion Chips */}
                {!isTyping && messages.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '4px' }}>
                      Suggestions
                    </span>
                    <button
                      onClick={() => handleSuggestionClick('Measure SNR of amplifier at 500 MHz')}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--color-text)', borderRadius: '18px', padding: '8px 16px', fontSize: '12px', textAlign: 'left', cursor: 'pointer', outline: 'none', transition: 'all 0.15s' }}
                      onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--border-color-hover)'; e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.backgroundColor = 'var(--bg-card)'; }}
                    >
                      Measure SNR of amplifier at 500 MHz
                    </button>
                    <button
                      onClick={() => handleSuggestionClick('Measure 10 kHz sine wave parameters')}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--color-text)', borderRadius: '18px', padding: '8px 16px', fontSize: '12px', textAlign: 'left', cursor: 'pointer', outline: 'none', transition: 'all 0.15s' }}
                      onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--border-color-hover)'; e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.backgroundColor = 'var(--bg-card)'; }}
                    >
                      Measure 10 kHz sine wave parameters
                    </button>
                    <button
                      onClick={() => handleSuggestionClick('Power a board at 5 V and trace a 25 kHz reference wave on the scope')}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--color-text)', borderRadius: '18px', padding: '8px 16px', fontSize: '12px', textAlign: 'left', cursor: 'pointer', outline: 'none', transition: 'all 0.15s' }}
                      onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--border-color-hover)'; e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.backgroundColor = 'var(--bg-card)'; }}
                    >
                      Power a board at 5 V and trace a 25 kHz reference wave on the scope
                    </button>
                    <button
                      onClick={() => handleSuggestionClick('Configure NGE100 at unsafe 45 V limits check')}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--color-text)', borderRadius: '18px', padding: '8px 16px', fontSize: '12px', textAlign: 'left', cursor: 'pointer', outline: 'none', transition: 'all 0.15s' }}
                      onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--border-color-hover)'; e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.backgroundColor = 'var(--bg-card)'; }}
                    >
                      Configure NGE100 at unsafe 45 V (safety limits demo)
                    </button>
                  </div>
                )}
                
                <div ref={messageEndRef} />
              </div>
              
              <form onSubmit={handleSend} className={styles.unifiedInputWrapper} style={{ opacity: (isStaging || isScriptStaging) ? 0.6 : 1 }}>
                <textarea
                  ref={textareaRef}
                  className={styles.unifiedTextInput}
                  placeholder={(isStaging || isScriptStaging) ? "Please wait..." : "Describe a measurement flow..."}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!(isStaging || isScriptStaging)) handleSend(e);
                    }
                  }}
                  rows={1}
                  disabled={isStaging || isScriptStaging}
                />
                <div className={styles.inputActionContainer}>
                  <button
                    type="button"
                    className={`${styles.integratedMicBtn} ${isListening ? styles.integratedMicBtnActive : ''}`}
                    onClick={toggleSpeech}
                    disabled={isStaging || isScriptStaging || isTranscribing}
                    title={isTranscribing ? 'Transcribing…' : isListening ? 'Stop recording' : 'Start voice input'}
                  >
                    {isTranscribing ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                        <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
                        <line x1="12" y1="19" x2="12" y2="22"/>
                      </svg>
                    )}
                  </button>
                  <button
                    type={isTyping ? "button" : "submit"}
                    className={styles.integratedSendBtn}
                    onClick={isTyping ? () => setIsTyping(false) : undefined}
                    disabled={isStaging || isScriptStaging || (!isTyping && !chatInput.trim())}
                    title={isTyping ? "Stop generating" : "Send message"}
                  >
                    {isTyping ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="4" y="4" width="16" height="16" rx="2" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                      </svg>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </section>

      {/* SCRIPT & WORKFLOW EXECUTION MODAL */}
      {isScriptModalOpen && (
        <div className={styles.modalOverlay} onClick={() => {
          if (!isTerminalRunning) setIsScriptModalOpen(false)
        }}>
          <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderTitle}>
                <span className={styles.modalHeaderIcon}>💻</span>
                <div>
                  <h2>SCPI Workflow & Automation</h2>
                  <p>Compile calibration parameters and run hardware loop validation</p>
                </div>
              </div>
              <button 
                className={styles.modalCloseBtn} 
                onClick={() => setIsScriptModalOpen(false)}
                disabled={isTerminalRunning}
              >
                ✕
              </button>
            </div>
            
            <div className={styles.modalBody}>
              {/* Left Column: Generated Python Script */}
              <div className={styles.modalColumnLeft}>
                <div className={styles.columnHeader}>
                  <span>GENERATED PYTHON SCPI SCRIPT (PyVISA)</span>
                  <button 
                    className={styles.modalCopyBtn}
                    style={copiedScript ? { color: '#10b981', borderColor: '#10b981' } : undefined}
                    onClick={() => {
                      if (generatedScript) {
                        navigator.clipboard.writeText(generatedScript).then(() => {
                          setCopiedScript(true)
                          setTimeout(() => setCopiedScript(false), 2000)
                        })
                      }
                    }}
                  >
                    {copiedScript ? "✓ Copied!" : "Copy Script"}
                  </button>
                </div>
                <textarea
                  className={styles.scriptPre}
                  value={generatedScript || ''}
                  onChange={(e) => setGeneratedScript(e.target.value)}
                  spellCheck={false}
                  disabled={isTerminalRunning}
                  style={{
                    border: 'none',
                    resize: 'none',
                    outline: 'none',
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              
              {/* Right Column: Checklist & Run Terminal */}
              <div className={styles.modalColumnRight}>
                {/* Checklist Section */}
                <div className={styles.checklistSection}>
                  <div className={styles.columnHeader}>
                    <span>📋 PRE-FLIGHT HARDWARE CHECKLIST</span>
                    <button 
                      className={styles.modalCopyBtn}
                      style={copiedChecklist ? { color: '#10b981', borderColor: '#10b981' } : undefined}
                      onClick={() => {
                        if (generatedChecklist) {
                          navigator.clipboard.writeText(generatedChecklist.join('\n')).then(() => {
                            setCopiedChecklist(true)
                            setTimeout(() => setCopiedChecklist(false), 2000)
                          })
                        }
                      }}
                    >
                      {copiedChecklist ? "✓ Copied!" : "Copy Checklist"}
                    </button>
                  </div>
                  <ul className={styles.checklistList}>
                    {generatedChecklist?.map((item, idx) => (
                      <li key={idx}>
                        <span className={styles.checkNumber}>{idx + 1}</span>
                        <span className={styles.checkText}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                {/* Rationale Section */}
                <div style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(255, 255, 255, 0.002)' }}>
                  <div className={styles.columnHeader}>
                    <span>💡 AI DESIGN DECISIONS & RATIONALE</span>
                  </div>
                  <ul className={styles.checklistList}>
                    {generatedRationale?.map((item, idx) => (
                      <li key={idx}>
                        <span style={{ color: '#fbbf24', fontSize: '14px', flexShrink: 0, marginTop: '2px' }}>✦</span>
                        <span className={styles.checkText}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                {/* Terminal Execution Section */}
                <div className={styles.terminalSection}>
                  <div className={styles.terminalHeader}>
                    <span>💻 MOCK SCPI EXECUTION BUS</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <label 
                        htmlFor="terminal-error-toggle" 
                        style={{ 
                          fontSize: '10px', 
                          color: 'var(--color-text-muted)', 
                          fontWeight: 700, 
                          textTransform: 'uppercase',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: isTerminalRunning ? 'not-allowed' : 'pointer'
                        }}
                      >
                        <input
                          id="terminal-error-toggle"
                          type="checkbox"
                          checked={simulateError}
                          onChange={(e) => setSimulateError(e.target.checked)}
                          disabled={isTerminalRunning}
                          style={{ margin: 0, cursor: isTerminalRunning ? 'not-allowed' : 'pointer' }}
                        />
                        Simulate Failure
                      </label>
                      <label 
                        htmlFor="terminal-speed-select" 
                        style={{ 
                          fontSize: '10px', 
                          color: 'var(--color-text-muted)', 
                          fontWeight: 700, 
                          textTransform: 'uppercase' 
                        }}
                      >
                        Speed:
                      </label>

                      <select
                        id="terminal-speed-select"
                        value={terminalSpeed}
                        onChange={(e) => setTerminalSpeed(Number(e.target.value))}
                        disabled={isTerminalRunning}
                        style={{
                          backgroundColor: 'var(--bg-code)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--color-text)',
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          outline: 'none',
                          cursor: isTerminalRunning ? 'not-allowed' : 'pointer'
                        }}
                      >
                        <option value={500}>0.5s</option>
                        <option value={250}>0.25s</option>
                        <option value={100}>0.1s</option>
                        <option value={0}>Instant</option>
                      </select>
                      <button
                        className={styles.terminalRunBtn}
                        onClick={handleRunWorkflow}
                        disabled={isTerminalRunning}
                      >
                        {isTerminalRunning ? "Running..." : "Run Workflow"}
                      </button>
                    </div>
                  </div>

                  
                  {isTerminalOpen && (
                    <div className={styles.terminalConsole}>
                      {terminalLogs.map((log, idx) => {
                        let color = 'var(--color-text-muted)'
                        if (log.type === 'cmd') color = '#22d3ee' // cyan for commands
                        if (log.type === 'warning') color = '#fbbf24' // amber for warnings
                        if (log.type === 'success') color = '#34d399' // green for success
                        if (log.type === 'error') color = '#ef4444' // red for errors

                        
                        return (
                          <div 
                            key={idx} 
                            style={{ 
                              color, 
                              fontFamily: 'var(--font-mono)', 
                              fontSize: '11px', 
                              lineHeight: '1.5',
                              padding: '2px 0',
                              fontWeight: log.type === 'success' ? 700 : 'normal'
                            }}
                          >
                            {log.text}
                          </div>
                        )
                      })}
                      <div ref={terminalEndRef} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
