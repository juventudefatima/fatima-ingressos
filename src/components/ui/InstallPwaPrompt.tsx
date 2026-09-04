import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'

const STORAGE_KEY = 'sidata-install-prompt-dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

// Aparece UMA VEZ SÓ (fica salvo no localStorage do aparelho da pessoa,
// não incomoda de novo depois que ela fechar ou instalar). Funciona
// diferente dependendo do sistema:
// - Android/Chrome/Edge: usa o evento nativo "beforeinstallprompt" e
//   mostra o botão de instalar de verdade do navegador.
// - iPhone (Safari): não existe esse evento, então mostra instruções de
//   como adicionar manualmente à Tela de Início.
export function InstallPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosInstructions, setShowIosInstructions] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(STORAGE_KEY)) return

    function handleBeforeInstall(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    // iOS não dispara beforeinstallprompt — mostra instruções manuais
    // depois de um pequeno atraso, pra não interromper o primeiro carregamento.
    let iosTimer: number | undefined
    if (isIos()) {
      iosTimer = window.setTimeout(() => {
        setShowIosInstructions(true)
        setVisible(true)
      }, 2000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      if (iosTimer) clearTimeout(iosTimer)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    dismiss()
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-4 animate-fade-in-up">
      <div className="bg-surface rounded-ticket shadow-card max-w-sm w-full p-6 animate-pop-in">
        <div className="text-center mb-4">
          <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-primary-light flex items-center justify-center text-3xl">
            📲
          </div>
          <h2 className="font-display font-bold text-lg">Instale o SI-DATA</h2>
          <p className="text-ink/60 text-sm mt-1">
            Adicione à tela inicial pra acessar seus tickets mais rápido, mesmo sem abrir o navegador.
          </p>
        </div>

        {showIosInstructions ? (
          <div className="bg-paper rounded-xl p-4 text-sm space-y-2 mb-4">
            <p>1. Toque no ícone de compartilhar <span className="font-mono">⬆️</span> na barra do Safari</p>
            <p>2. Escolha <span className="font-semibold">"Adicionar à Tela de Início"</span></p>
            <p>3. Toque em <span className="font-semibold">"Adicionar"</span></p>
          </div>
        ) : null}

        <div className="flex gap-3">
          <Button variant="outline" fullWidth onClick={dismiss}>
            Agora não
          </Button>
          {!showIosInstructions && (
            <Button fullWidth onClick={handleInstallClick}>
              Instalar
            </Button>
          )}
          {showIosInstructions && (
            <Button fullWidth onClick={dismiss}>
              Entendi
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
