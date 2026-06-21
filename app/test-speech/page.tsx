'use client'

import { useState } from 'react'

export default function TestSpeech() {
  const [logs, setLogs] = useState<string[]>([])

  function log(msg: string) {
    console.log(msg)
    setLogs(prev => [msg, ...prev])
  }

  function startTest() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      log('ERROR: SpeechRecognition غير مدعوم في هذا المتصفح')
      return
    }

    const recognition = new SR()
    recognition.lang = 'ar-SA'
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onstart = () => log('STARTED')
    recognition.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript
        const final = e.results[i].isFinal ? '[FINAL]' : '[interim]'
        log(`RESULT ${final} "${text}"`)
      }
    }
    recognition.onerror = (e: any) => log(`ERROR: ${e.error} — ${e.message ?? ''}`)
    recognition.onend = () => log('ENDED')

    recognition.start()
  }

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', direction: 'ltr' }}>
      <button
        onClick={startTest}
        style={{ padding: '16px 32px', fontSize: 18, display: 'block', marginBottom: 24 }}
      >
        Test Speech
      </button>

      <div style={{ background: '#111', color: '#0f0', padding: 16, minHeight: 200, borderRadius: 8 }}>
        {logs.length === 0
          ? <span style={{ color: '#555' }}>اضغط الزر وتكلم...</span>
          : logs.map((l, i) => <div key={i}>{l}</div>)
        }
      </div>
    </div>
  )
}
