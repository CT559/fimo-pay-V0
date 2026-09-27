/**
 * ParkingScreen — Bãi đỗ xe thông minh
 * Vào cổng · Ra cổng · Tự trả
 */
import { ParkingCircle } from 'lucide-react'
import ServiceScreen, { type ServiceConfig } from './ServiceScreen'
import type { LangCode } from '../i18n'

const PARKING_CONFIG: ServiceConfig = {
  type:         'parking',
  Icon:         ({ size = 24, color = 'currentColor' }) => <ParkingCircle size={size} color={color} />,
  titleKey:     'home_parking',
  subtitleKey:  'home_parking_desc',
  demoMerchant: '0x5B12Ce46C7194aD57d143bC22847224047b1Ef42',
  demoItems: [
    { label: 'Giữ xe 1 giờ đầu',  amount: 0.50 },
    { label: 'Giữ xe giờ tiếp theo', amount: 0.30 },
  ],
  demoTotal:  0.80,
  unitLabel: 'Thời gian',
  unitValue: '1 giờ 12 phút',
}

export default function ParkingScreen({ lang }: { lang: LangCode }) {
  return <ServiceScreen lang={lang} config={PARKING_CONFIG} />
}
