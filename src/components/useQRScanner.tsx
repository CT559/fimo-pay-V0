/**
 * useQRScanner — cross-browser QR scanner
 * Dùng jsQR + canvas polling; fallback BarcodeDetector nếu có.
 * Không dùng BarcodeDetector làm primary vì chưa hỗ trợ rộng.
 */
'use no memo'

import { useRef, useEffect, useCallback } from 'react'
import jsQR from 'jsqr'

export type CamErrorCode = 'cam_not_supported' | 'cam_permission_denied' | 'cam_not_found' | 'cam_generic'
type ScanResult = { ok: true } | { ok: false; error: string; code: CamErrorCode; noCam?: boolean }

export function useQRScanner(onDetected: (raw: string) => void) {
  'use no memo'
  const videoRef      = useRef<HTMLVideoElement | null>(null)
  const canvasRef     = useRef<HTMLCanvasElement | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const rafRef        = useRef<number>(0)
  const detectedRef   = useRef(false)
  const onDetectedRef = useRef(onDetected)

  // Keep callback ref up to date without triggering re-renders
  useEffect(() => { onDetectedRef.current = onDetected })

  const stopStream = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    detectedRef.current = false
  }, [])

  const openCamera = useCallback(async (): Promise<ScanResult> => {
    detectedRef.current = false

    if (!navigator.mediaDevices?.getUserMedia) {
      return { ok: false, error: 'cam_not_supported', code: 'cam_not_supported' as CamErrorCode, noCam: true }
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
    } catch (err) {
      const e = err as { name?: string; message?: string }
      if (e?.name === 'NotAllowedError')
        return { ok: false, error: 'cam_permission_denied', code: 'cam_permission_denied' as CamErrorCode, noCam: false }
      if (e?.name === 'NotFoundError')
        return { ok: false, error: 'cam_not_found', code: 'cam_not_found' as CamErrorCode, noCam: true }
      return { ok: false, error: 'cam_generic', code: 'cam_generic' as CamErrorCode, noCam: true }
    }

    streamRef.current = stream
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) {
      stopStream()
      return { ok: false, error: 'cam_generic', code: 'cam_generic' as CamErrorCode, noCam: false }
    }

    video.srcObject = stream
    await video.play().catch(() => {})

    // jsQR polling via rAF
    const tick = () => {
      if (detectedRef.current || !streamRef.current) return
      const ctx = canvas.getContext('2d')
      if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width  = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(img.data, img.width, img.height)
        if (code?.data) {
          detectedRef.current = true
          stopStream()
          onDetectedRef.current(code.data)
          return
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return { ok: true }
  }, [stopStream])

  const closeCamera = useCallback(() => { stopStream() }, [stopStream])

  // Cleanup on unmount
  useEffect(() => () => { stopStream() }, [stopStream])

  const canvasElement = (
    <canvas
      ref={canvasRef}
      style={{ display: 'none', position: 'absolute' }}
      aria-hidden="true"
    />
  )

  return { videoRef, canvasElement, openCamera, closeCamera }
}
