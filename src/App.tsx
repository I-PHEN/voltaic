import { useState } from 'react'
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
      return '#64748b' // Slate/gray
  }
}

function App() {
  const [chatInput, setChatInput] = useState('')
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  // Clear all nodes
  const handleClear = () => {
    setNodes([])
  }

  // Handle Drag Start from Sidebar Card
  const handleSidebarDragStart = (e: React.DragEvent, deviceId: string) => {
    e.dataTransfer.setData('source', 'sidebar')
    e.dataTransfer.setData('device_id', deviceId)
  }

  // Handle Drag Start from existing Canvas Node
  const handleNodeDragStart = (e: React.DragEvent, nodeId: string) => {
    e.dataTransfer.setData('source', 'canvas')
    e.dataTransfer.setData('node_id', nodeId)
    
    // Store drag offset relative to the node's top-left corner to avoid snapping
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    e.dataTransfer.setData('offset_x', offsetX.toString())
    e.dataTransfer.setData('offset_y', offsetY.toString())
  }

  // Handle Drag Over Canvas
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(true)
  }

  // Handle Drag Leave Canvas
  const handleDragLeave = () => {
    setIsDraggingOver(false)
  }

  // Handle Drop on Canvas
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(false)

    const source = e.dataTransfer.getData('source')
    const rect = e.currentTarget.getBoundingClientRect()
    const dropX = e.clientX - rect.left
    const dropY = e.clientY - rect.top

    if (source === 'sidebar') {
      const deviceId = e.dataTransfer.getData('device_id')
      const device = devices.find((d) => d.id === deviceId)
      if (device) {
        // Place new node centered under cursor
        const newNode: CanvasNode = {
          id: `${deviceId}_${Date.now()}`,
          deviceId: device.id,
          name: device.name,
          type: device.type,
          x: Math.max(10, dropX - 87), // keep within reasonable bounds
          y: Math.max(10, dropY - 40)
        }
        setNodes((prev) => [...prev, newNode])
      }
    } else if (source === 'canvas') {
      const nodeId = e.dataTransfer.getData('node_id')
      const offsetX = parseFloat(e.dataTransfer.getData('offset_x') || '0')
      const offsetY = parseFloat(e.dataTransfer.getData('offset_y') || '0')

      // Reposition existing node
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                x: Math.max(10, dropX - offsetX),
                y: Math.max(10, dropY - offsetY)
              }
            : n
        )
      )
    }
  }

  // Delete a specific node
  const handleDeleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId))
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    setChatInput('')
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
          className={`${styles.canvasSurface} ${
            isDraggingOver ? styles.canvasSurfaceDragging : ''
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
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
              return (
                <div
                  key={node.id}
                  className={nodeStyles.nodeCard}
                  style={{
                    transform: `translate(${node.x}px, ${node.y}px)`,
                    borderLeft: `4px solid ${borderLeftColor}`
                  }}
                  draggable
                  onDragStart={(e) => handleNodeDragStart(e, node.id)}
                >
                  <div className={nodeStyles.nodeHeader}>
                    <span className={nodeStyles.nodeName}>{node.name}</span>
                    <span className={nodeStyles.nodeType}>{node.type}</span>
                    <button
                      className={nodeStyles.deleteButton}
                      onClick={() => handleDeleteNode(node.id)}
                      title="Remove instrument"
                    >
                      ✕
                    </button>
                  </div>
                  <div className={nodeStyles.nodeBody}>
                    <div className={nodeStyles.statusIndicator}>
                      <span className={`${nodeStyles.statusDot} ${nodeStyles.statusDotActive}`} />
                      <span>Simulated</span>
                    </div>
                  </div>
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
