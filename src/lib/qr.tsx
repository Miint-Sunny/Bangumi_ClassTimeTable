/**
 * 二维码:房间链接给投屏用。qrcode-generator(MIT,无依赖)算出模块矩阵,这里拼成一条 SVG path,
 * 固定白底黑格(不跟主题走,扫码器才认)。
 */
import qrcode from 'qrcode-generator'

export interface QrData {
  d: string // 每个暗格一个 1×1 方块的 path
  size: number // viewBox 边长 = 模块数 + 两侧留白
}

export function qrData(text: string, margin = 2): QrData {
  const qr = qrcode(0, 'M') // 0 = 自动选版本;M 级纠错够用,模块少扫得快
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`
  return { d, size: n + margin * 2 }
}

export function QrSvg({ text, px }: { text: string; px: number }) {
  const { d, size } = qrData(text)
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={px} height={px} shapeRendering="crispEdges" role="img" aria-label={text}>
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}
