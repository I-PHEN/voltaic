import { useState, useRef } from 'react'
import styles from './components/Layout.module.css'
import nodeStyles from './components/Node.module.css'
import { devices } from './data/devices'

interface CanvasNode {
  id: string;
  deviceId: string;
  name: string;
  type: string;
  x: number;
  y: number;
}

interface Connection {
  id: string;
  fromId: string;
  toId: string;
}

interface ActiveWire {
  fromId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
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

function App() {
  const [chatInput, setChatInput] = useState('')
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  
  // Dragging states
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [draggingNode, setDraggingNode] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  
  // Connection line state
  const [activeWire, setActiveWire] = useState<ActiveWire | null>(null)
  
  const canvasRef = useRef<HTMLDivElement>(null)

  // Clear canvas
  const handleClear = () => {
    setNodes([])
    setConnections([])
    setActiveWire(null)
  }

  // Handle Drag from Sidebar
  const handleSidebarDragStart = (e: React.DragEvent, deviceId: string) => {
    e.dataTransfer.setData('source', 'sidebar')
    e.dataTransfer.setData('device_id', deviceId)
  }

  // Handle Drag Start for Node (repositioning)
  const handleNodeDragStart = (e: React.DragEvent, node: CanvasNode) => {
    e.dataTransfer.setData('source', 'canvas')
    e.dataTransfer.setData('node_id', node.id)
    
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    
    // Store local React state for real-time drag updates
    setDraggingNode({ id: node.id, offsetX, offsetY })
    
    // Set minimal ghost drag image to avoid double graphics
    const img = new Image()
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    e.dataTransfer.setDragImage(img, 0, 0)
  }

  // Handle Drag Over Canvas
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(true)

    // Real-time position tracking during drag
    if (draggingNode && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      const targetX = Math.max(10, mouseX - draggingNode.offsetX)
      const targetY = Math.max(10, mouseY - draggingNode.offsetY)
      
      setNodes((prev) =>
        prev.map((n) => (n.id === draggingNode.id ? { ...n, x: targetX, y: targetY } : n))
      )
    }
  }

  const handleDragLeave = () => {
    setIsDraggingOver(false)
  }

  // Handle Drop on Canvas
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(false)
    setDraggingNode(null)

    const source = e.dataTransfer.getData('source')
    if (source === 'sidebar' && canvasRef.current) {
      const deviceId = e.dataTransfer.getData('device_id')
      const device = devices.find((d) => d.id === deviceId)
      const rect = canvasRef.current.getBoundingClientRect()
      const dropX = e.clientX - rect.left
      const dropY = e.clientY - rect.top

      if (device) {
        const newNode: CanvasNode = {
          id: `${deviceId}_${Date.now()}`,
          deviceId: device.id,
          name: device.name,
          type: device.type,
          x: Math.max(10, dropX - 95), // Centering card (190px width)
          y: Math.max(10, dropY - 62)  // Centering card (~125px height)
        }
        setNodes((prev) => [...prev, newNode])
      }
    }
  }

  const handleDragEnd = () => {
    setDraggingNode(null)
  }

  // Delete Node & Associated Connections
  const handleDeleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId))
    setConnections((prev) => prev.filter((c) => c.fromId !== nodeId && c.toId !== nodeId))
  }

  // CONNECTION PORT EVENT HANDLERS
  const handlePortMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    e.preventDefault()
    
    const node = nodes.find((n) => n.id === nodeId)
    if (node) {
      setActiveWire({
        fromId: nodeId,
        startX: node.x + 190, // Right port position
        startY: node.y + 62,  // Middle height of card
        currentX: node.x + 190,
        currentY: node.y + 62
      })
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (activeWire && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      setActiveWire((prev) =>
        prev
          ? {
              ...prev,
              currentX: mouseX,
              currentY: mouseY
            }
          : null
      )
    }
  }

  const handleCanvasMouseUp = () => {
    setActiveWire(null)
  }

  const handlePortMouseUp = (e: React.MouseEvent, toId: string) => {
    e.stopPropagation()
    if (activeWire && activeWire.fromId !== toId) {
      // Check if connection already exists
      const exists = connections.some(
        (c) => c.fromId === activeWire.fromId && c.toId === toId
      )
      if (!exists) {
        setConnections((prev) => [
          ...prev,
          {
            id: `${activeWire.fromId}-${toId}`,
            fromId: activeWire.fromId,
            toId
          }
        ])
      }
    }
    setActiveWire(null)
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    setChatInput('')
  }

  // Render Visual LCD Display inside the node cards
  const renderNodeScreen = (node: CanvasNode) => {
    switch (node.deviceId) {
      case 'fpc1500': // Spectrum Analyzer
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
              <path d="M 4 26 L 30 26 L 50 26 L 70 26 L 80 20 L 90 4 L 100 20 L 110 26 L 166 26" />
            </svg>
            <div className={nodeStyles.screenLabel}>SPAN: 500 MHz</div>
          </div>
        )
      case 'rtb24': // Oscilloscope
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
            <div className={nodeStyles.screenLabel}>CH1: 1.00V / DIV</div>
          </div>
        )
      case 'nge100': // Power Supply
        return (
          <div className={nodeStyles.nodeScreen}>
            <div className={nodeStyles.screenReadout}>
              <span>12.00 V</span>
              <span>1.50 A</span>
            </div>
            <div className={nodeStyles.screenLabel}>CH1: OUTPUT ON</div>
          </div>
        )
      default:
        return (
          <div className={nodeStyles.nodeScreen}>
            <div className={nodeStyles.screenReadout} style={{ color: '#0091ff', textShadow: '0 0 4px rgba(0, 145, 255, 0.4)' }}>
              <span>ACTIVE</span>
            </div>
            <div className={nodeStyles.screenLabel}>SIMULATOR CONNECTED</div>
          </div>
        )
    }
  }

  return (
    <div className={styles.appContainer}>
      {/* LEFT SIDEBAR: Branding Header & Instruments List */}
      <aside className={styles.sidebar}>
        <div className={styles.logoSection}>
          <div className={styles.logoIcon}>⚡</div>
          <div className={styles.logoTextContainer}>
            <h1 className={styles.logoText}>VOLTAIC</h1>
            <span className={styles.logoSubtitle}>R&S Workflow Builder</span>
          </div>
        </div>

        <h2 className={styles.sidebarTitle}>Instruments</h2>
        <div className={styles.deviceList}>
          {devices.map((device) => {
            const typeColor = getDeviceColor(device.type)
            return (
              <div
                key={device.id}
                className={styles.deviceCard}
                draggable
                onDragStart={(e) => handleSidebarDragStart(e, device.id)}
              >
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
      </aside>

      {/* CENTER CANVAS PANEL */}
      <main className={styles.canvasContainer}>
        {/* TOOLBAR */}
        <div className={styles.toolbar}>
          <button className={styles.toolbarButton} onClick={handleClear}>
            Clear
          </button>
          <button className={styles.toolbarButton}>Validate</button>
          <button
            className={`${styles.toolbarButton} ${styles.toolbarButtonPrimary}`}
          >
            Generate Script
          </button>
        </div>

        {/* CANVAS SURFACE */}
        <div
          ref={canvasRef}
          className={`${styles.canvasSurface} ${
            isDraggingOver ? styles.canvasSurfaceDragging : ''
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
        >
          {/* SVG CONNECTIONS OVERLAY */}
          <svg className={styles.connectionsSvg}>
            {connections.map((conn) => {
              const fromNode = nodes.find((n) => n.id === conn.fromId)
              const toNode = nodes.find((n) => n.id === conn.toId)
              if (!fromNode || !toNode) return null

              const x1 = fromNode.x + 190 // Output Port
              const y1 = fromNode.y + 62  // Vertically centered
              const x2 = toNode.x         // Input Port
              const y2 = toNode.y + 62

              // Curved Bezier calculation
              const cp1x = x1 + 50
              const cp2x = x2 - 50

              return (
                <path
                  key={conn.id}
                  d={`M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`}
                  stroke="var(--color-primary)"
                  strokeWidth="2.5"
                  fill="none"
                  style={{ filter: 'drop-shadow(0 0 3px rgba(0, 145, 255, 0.35))' }}
                />
              )
            })}

            {/* Active wire being dragged */}
            {activeWire && (
              <path
                d={`M ${activeWire.startX} ${activeWire.startY} C ${
                  activeWire.startX + 50
                } ${activeWire.startY}, ${activeWire.currentX - 50} ${
                  activeWire.currentY
                }, ${activeWire.currentX} ${activeWire.currentY}`}
                stroke="var(--color-primary)"
                strokeWidth="2"
                strokeDasharray="4 3"
                fill="none"
                style={{ opacity: 0.8 }}
              />
            )}
          </svg>

          {nodes.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>＋</div>
              <div className={styles.emptyStateText}>
                Drag an instrument here to start
              </div>
            </div>
          ) : (
            nodes.map((node) => {
              const borderLeftColor = getDeviceColor(node.type)
              const hasInputConnection = connections.some((c) => c.toId === node.id)
              const hasOutputConnection = connections.some((c) => c.fromId === node.id)
              
              return (
                <div
                  key={node.id}
                  className={nodeStyles.nodeCard}
                  style={{
                    transform: `translate(${node.x}px, ${node.y}px)`,
                    borderLeft: `4px solid ${borderLeftColor}`
                  }}
                  draggable
                  onDragStart={(e) => handleNodeDragStart(e, node)}
                  onDragEnd={handleDragEnd}
                >
                  {/* Left Connection Port */}
                  <div
                    className={`${nodeStyles.port} ${nodeStyles.portLeft} ${
                      hasInputConnection ? nodeStyles.portConnected : ''
                    }`}
                    onMouseUp={(e) => handlePortMouseUp(e, node.id)}
                    title="Input Port"
                  />

                  <div className={nodeStyles.nodeHeader}>
                    <span className={nodeStyles.nodeName}>{node.name}</span>
                    <span className={nodeStyles.nodeType}>{node.type}</span>
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
                      <span className={`${nodeStyles.statusDot} ${nodeStyles.statusDotActive}`} />
                      <span>Simulated</span>
                    </div>
                  </div>

                  {/* Right Connection Port */}
                  <div
                    className={`${nodeStyles.port} ${nodeStyles.portRight} ${
                      hasOutputConnection ? nodeStyles.portConnected : ''
                    }`}
                    onMouseDown={(e) => handlePortMouseDown(e, node.id)}
                    title="Output Port"
                  />
                </div>
              )
            })
          )}
        </div>
      </main>

      {/* RIGHT PANEL: Chat Assistant */}
      <section className={styles.chatPanel}>
        <div className={styles.chatTitle}>
          <span className={styles.chatIndicator} />
          Voltaic Assistant
        </div>
        <div className={styles.messageList}>
          <div className={`${styles.messageItem} ${styles.messageAssistant}`}>
            <span className={styles.messageSender}>Assistant</span>
            <div className={`${styles.messageBubble} ${styles.bubbleAssistant}`}>
              Hi! Describe a measurement and I'll build the workflow for you.
            </div>
          </div>
        </div>
        <form onSubmit={handleSend} className={styles.inputArea}>
          <input
            type="text"
            className={styles.textInput}
            placeholder="Describe a measurement flow..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button type="submit" className={styles.sendButton}>
            Send
          </button>
        </form>
      </section>
    </div>
  )
}

export default App
