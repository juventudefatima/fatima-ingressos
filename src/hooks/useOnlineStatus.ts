import { useEffect, useState } from 'react'

// Detecta online/offline de verdade, não só o navigator.onLine inicial
// (que às vezes mente em Wi-Fi "conectado mas sem internet" — por isso o
// ideal seria testar uma requisição real, mas pro nosso caso os eventos
// online/offline do navegador já resolvem 95% dos casos práticos).
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    function goOnline() {
      setIsOnline(true)
    }
    function goOffline() {
      setIsOnline(false)
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return isOnline
}
