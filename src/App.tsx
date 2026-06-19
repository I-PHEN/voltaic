import { useState } from 'react'
import styles from './components/Layout.module.css'
import { devices } from './data/devices'

function App() {
  const [chatInput, setChatInput] = useState('')

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    // Simple mock send for V1 layout
    setChatInput('')
  }

  return (
    <div className={styles.appContainer}>
      {/* LEFT SIDEBAR: Instruments */}
      <aside className={styles.sidebar}>
        <h2 className={styles.sidebarTitle}>Instruments</h2>
        <div className={styles.deviceList}>
          {devices.map((device) => (
            <div key={device.id} className={styles.deviceCard}>
              <span className={styles.deviceName}>{device.name}</span>
              <span className={styles.deviceType}>{device.type}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* CENTER CANVAS PANEL */}
      <main className={styles.canvasContainer}>
        {/* TOOLBAR */}
        <div className={styles.toolbar}>
          <button className={styles.toolbarButton}>Clear</button>
          <button className={styles.toolbarButton}>Validate</button>
          <button className={`${styles.toolbarButton} ${styles.toolbarButtonPrimary}`}>
            Generate Script
          </button>
        </div>

        {/* CANVAS SURFACE */}
        <div className={styles.canvasSurface}>
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8" />
                <path d="M8 12h8" />
              </svg>
            </div>
            <div className={styles.emptyStateText}>Drag an instrument to start</div>
          </div>
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
