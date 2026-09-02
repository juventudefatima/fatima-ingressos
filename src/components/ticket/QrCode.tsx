import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

// Só QR (sem código de barras 1D — mais confiável pra câmera de celular
// lendo a tela de outro celular) e com fundo BRANCO SÓLIDO, não
// transparente. Fundo transparente deixa o conteúdo por trás (que pode
// ser escuro, em modo noturno) aparecer por baixo dos módulos "claros"
// do QR, tornando-o ilegível — por isso o branco aqui é forçado, tanto no
// próprio QR quanto no contêiner ao redor.
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 1,
        color: { dark: '#12231F', light: '#FFFFFF' },
      }).catch(() => {
        /* valor inválido — ignorado silenciosamente */
      })
    }
  }, [value, size])

  return (
    <div className="bg-white rounded-xl p-4 inline-flex items-center justify-center shadow-sm border border-line/40">
      <canvas ref={canvasRef} />
    </div>
  )
}
