/**
 * useQRScanner v2 — Works on ALL browsers (Chrome, Safari, Firefox, mobile)
 *
 * Strategy:
 *  1. Try native BarcodeDetector (Chrome 83+ desktop/Android) — fastest
 *  2. Fallback to jsQR canvas decode (every modern browser) — universal
 *  3. If getUserMedia denied / no camera → returns { ok: false, noCam: true }
 *     so the UI can show a manual-input fallback immediately
 */
import { useRef, useEffect, useCallback } from 'react'
import jsQR from 'jsqr'

type ScanResult = { ok: true } | { ok: false; error: string; noCam?: boolean }

export function useQRScanner(onDetected: (raw: string) => void) {
  'use no memo'
  const videoRef      = useRef<HTMLVideoElement | null>(null)
  const canvasRef     = useRef<HTMLCanvasElement | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const scannerRef    = useRef<number>(0)
  const onDetectedRef = useRef(onDetected)
  const detectedRef   = useRef(false)  // prevent double-fire

  // Always update ref so callback uses latest closure
  useEffect(() => { onDetectedRef.current = onDetected })

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopStream() {
    if (scannerRef.current) {
      clearInterval(scannerRef.current)
      scannerRef.current = 0
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(tr => tr.stop())
      streamRef.current = null
    }
  }

  // ── Core: decode QR from current video frame via jsQR ──────────────────────
  function decodeFrame(): boolean {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return false
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return false
    canvas.width  = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    ctx.drawImage(video, 0, 0, w, h)
    const imageData = ctx.getImageData(0, 0, w, h)
    const result = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' })
    if (result?.data) {
      onDetectedRef.current(result.data)
      return true
    }
    return false
  }

  // ── Native BarcodeDetector (faster on supported browsers) ─────────────────
  function startNativeDetector(video: HTMLVideoElement) {
    type BD = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
    type BDCtor = new (opts: { formats: string[] }) => BD
    const detector = new (window as unknown as { BarcodeDetector: BDCtor }).BarcodeDetector({
      formats: ['qr_code'],
    })
    scannerRef.current = window.setInterval(async () => {
      if (detectedRef.current) return
      try {
        const codes = await detector.detect(video)
        if (codes.length > 0 && codes[0].rawValue) {
          detectedRef.current = true
          stopStream()
          onDetectedRef.current(codes[0].rawValue)
        }
      } catch {
        // BarcodeDetector failed — switch to jsQR
        clearInterval(scannerRef.current)
        startJsQRScanner()
      }
    }, 200)
  }

  // ── jsQR fallback (every browser) ─────────────────────────────────────────
  function startJsQRScanner() {
    scannerRef.current = window.setInterval(() => {
      if (detectedRef.current) return
      if (decodeFrame()) {
        detectedRef.current = true
        stopStream()
      }
    }, 250)
  }

  // ── Public: open camera ────────────────────────────────────────────────────
  const openCamera = useCallback(async (): Promise<ScanResult> => {
    detectedRef.current = false
    stopStream()

    // Check getUserMedia support
    if (!navigator.mediaDevices?.getUserMedia) {
      return { ok: false, error: 'Camera không được hỗ trợ trên trình duyệt này', noCam: true }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }

      // Choose best decoder
      if ('BarcodeDetector' in window && video) {
        startNativeDetector(video)
      } else {
        startJsQRScanner()
      }

      return { ok: true }
    } catch (err) {
      const e = err as DOMException
      // NotAllowedError = user denied permission
      // NotFoundError   = no camera device
      const noCam = e.name === 'NotFoundError' || e.name === 'NotAllowedError'
      return {
        ok: false,
        error: noCam
          ? 'Không có quyền truy cập camera. Vui lòng cho phép trong trình duyệt.'
          : (e.message || 'Camera không khả dụng'),
        noCam,
      }
    }
  }, [])

  // ── Public: close camera ───────────────────────────────────────────────────
  const closeCamera = useCallback(() => {
    stopStream()
  }, [])

  // Canvas element hidden in DOM — jsQR needs it
  const canvasElement = (
    <canvas
      ref={canvasRef}
      style={{ display: 'none' }}
      aria-hidden="true"
    />
  )

  return { videoRef, canvasElement, openCamera, closeCamera }
}
