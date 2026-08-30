import { useEffect, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

// Mostra o código como barras (Code128, leitura rápida por leitores 1D)
// e, ao lado, um QR code com o mesmo valor como alternativa/fallback --
// câmeras de celular geralmente leem QR com mais confiabilidade do que
// um barcode 1D exibido na tela de outro celular.
export function BarcodeDisplay({ value }: { value: string }) {
  const barcodeRef = useRef<SVGSVGElement>(null)
  const [qrUrl, setQrUrl] = useState('')
  const [showQr, setShowQr] = useState(false)

  useEffect(() => {
    if (barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, value, {
          format: 'CODE128',
          width: 2.4,
          height: 70,
          displayValue: false,
          margin: 0,
          background: 'transparent',
          lineColor: '#12231F',
        })
      } catch {
        /* valor incompatível — ignorado silenciosamente */
      }
    }
    QRCode.toDataURL(value, { margin: 1, width: 220, color: { dark: '#12231F', light: '#00000000' } }).then(setQrUrl)
  }, [value])

  return (
    <div className="flex flex-col items-center gap-3">
      {!showQr ? (
        <svg ref={barcodeRef} className="w-full max-w-xs" />
      ) : (
        qrUrl && <img src={qrUrl} alt="QR code do ticket" className="h-44 w-44" />
      )}
      <p className="font-mono text-lg tracking-[0.3em] font-semibold">{value}</p>
      <button
        type="button"
        onClick={() => setShowQr((v) => !v)}
        className="text-xs text-primary underline underline-offset-2"
      >
        {showQr ? 'Ver como código de barras' : 'Câmera com dificuldade? Ver QR code'}
      </button>
    </div>
  )
}
