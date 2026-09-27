import QRPaymentFlow from './QRPaymentFlow'
import type { LangCode } from '../i18n'

export default function CheckoutScreen({ lang }: { lang: LangCode }) {
  return <QRPaymentFlow lang={lang} mode="checkout" />
}
