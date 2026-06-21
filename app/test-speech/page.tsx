'use client'

export default function TestSpeech() {
  function startTest() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      console.error('ERROR: SpeechRecognition not supported in this browser')
      return
    }

    const recognition = new SR()
    recognition.lang = 'ar-SA'
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onstart = () => console.log('STARTED')
    recognition.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript
        const final = e.results[i].isFinal ? '[FINAL]' : '[interim]'
        console.log('RESULT', final, text)
      }
    }
    recognition.onerror = (e: any) => console.log('ERROR', e.error, e.message)
    recognition.onend = () => console.log('ENDED')

    recognition.start()
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <button onClick={startTest} style={{ padding: '20px 40px', fontSize: '20px' }}>
        Test Speech
      </button>
    </div>
  )
}
