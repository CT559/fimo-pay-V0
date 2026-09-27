import { useState, useEffect } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Home, ShoppingCart, Send, Settings, Wifi, User, Sun, Moon, ArrowDownToLine } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { LogoWithFallback } from './components/FimoLogo'
import CheckoutScreen from './components/CheckoutScreen'
import RemittanceScreen from './components/RemittanceScreen'
import SettingsScreen from './components/SettingsScreen'
import BridgeScreen from './components/BridgeScreen'
import FaucetButton from './components/FaucetButton'
import LangPicker from './components/LangPicker'
import type { LangCode } from './i18n'
import { t } from './i18n'

type Tab = 'home' | 'checkout' | 'remittance' | 'bridge' | 'settings'

/* ── Wave background — tái tạo nền fimoPAY brand ──────────────── */
function WaveBg({ dark }: { dark: boolean }) {
  const c1 = dark ? 'rgba(77,163,255,0.10)' : 'rgba(255,255,255,0.60)'
  const c2 = dark ? 'rgba(26,111,255,0.08)' : 'rgba(91,190,255,0.32)'
  const c3 = dark ? 'rgba(91,190,255,0.06)' : 'rgba(26,111,255,0.15)'
  return (
    <div className="wave-bg" aria-hidden="true">
      {/* Large arc top-left */}
      <div style={{
        position:'absolute', top:'-18%', left:'-12%',
        width:'75vw', height:'75vw', maxWidth:600, maxHeight:600,
        borderRadius:'50%',
        border:`2px solid ${c1}`,
        filter:'blur(1px)',
      }}/>
      {/* Medium arc bottom-right */}
      <div style={{
        position:'absolute', bottom:'-15%', right:'-10%',
        width:'60vw', height:'60vw', maxWidth:480, maxHeight:480,
        borderRadius:'50%',
        border:`2px solid ${c2}`,
        filter:'blur(1px)',
      }}/>
      {/* Small arc center */}
      <div style={{
        position:'absolute', top:'38%', left:'52%',
        width:'40vw', height:'40vw', maxWidth:320, maxHeight:320,
        borderRadius:'50%',
        border:`1.5px solid ${c3}`,
        filter:'blur(0.5px)',
      }}/>
      {/* Soft radial glow top-right */}
      <div style={{
        position:'absolute', top:'-5%', right:'-5%',
        width:360, height:360,
        borderRadius:'50%',
        background: dark
          ? 'radial-gradient(circle, rgba(26,111,255,0.18) 0%, transparent 65%)'
          : 'radial-gradient(circle, rgba(26,111,255,0.14) 0%, transparent 65%)',
        filter:'blur(48px)',
      }}/>
      {/* Soft radial glow bottom-left */}
      <div style={{
        position:'absolute', bottom:'8%', left:'-8%',
        width:300, height:300,
        borderRadius:'50%',
        background: dark
          ? 'radial-gradient(circle, rgba(91,190,255,0.10) 0%, transparent 68%)'
          : 'radial-gradient(circle, rgba(91,190,255,0.22) 0%, transparent 68%)',
        filter:'blur(40px)',
      }}/>
    </div>
  )
}





// ── Home screen ───────────────────────────────────────────────
interface HomeScreenProps {
  dark?: boolean
  lang: LangCode
  onNavigate: (tab: Tab) => void
}

function HomeScreen({ lang, onNavigate }: HomeScreenProps) {
  const { address, isConnected } = useAccount()
  const shortAddr = address ? `${address.slice(0, 6)}···${address.slice(-4)}` : ''

  // Bảng tỷ giá tham chiếu (static demo — thực tế sẽ pull từ FX oracle)
  const RATES = [
    { flag: '🇻🇳', from: 'USDC', to: 'USDC',  rate: '1.00',  country: 'Việt Nam'    },
    { flag: '🇵🇭', from: 'USDC', to: 'PHPC',  rate: '1.00',  country: 'Philippines' },
    { flag: '🇰🇷', from: 'USDC', to: 'KRW1',  rate: '1,350', country: '한국'         },
    { flag: '🇯🇵', from: 'USDC', to: 'JPYC',  rate: '153.4', country: '日本'         },
    { flag: '🇹🇭', from: 'USDC', to: 'USDC',  rate: '1.00',  country: 'ไทย'         },
    { flag: '🇹🇼', from: 'USDC', to: 'USDC',  rate: '1.00',  country: '台灣'         },
  ]

  return (
    <div className="flex flex-col gap-4">

      {/* ── Hero — kiều hối là trọng tâm ── */}
      <section className="glass-card rounded-3xl overflow-hidden">
        <div className="h-[3px]" style={{ background: 'var(--spectral)' }} />
        <div className="p-5">

          {/* Status row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ background: 'var(--accent-soft)', border: '1px solid rgba(26,111,255,0.18)' }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                style={{ background: 'var(--accent)' }} />
              <span className="text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>
                Arc Testnet
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {isConnected
                ? <Wifi size={12} style={{ color: 'var(--success)' }} />
                : <User size={12} style={{ color: 'var(--subtle)' }} />}
              <span className="mono text-[11px] font-medium"
                style={{ color: isConnected ? 'var(--ink-2)' : 'var(--subtle)' }}>
                {isConnected ? shortAddr : t(lang, 'home_connect_hint_short')}
              </span>
            </div>
          </div>

          {/* Main tagline — kiều hối focused */}
          <h1 className="display font-bold leading-[1.18]"
            style={{ fontSize: 26, color: 'var(--ink)', marginBottom: 6 }}>
            {t(lang, 'home_tagline').split('\n').map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {i === 1 ? <span style={{ color: 'var(--accent)' }}>{line}</span> : line}
              </span>
            ))}
          </h1>
          <p className="text-[13px] leading-relaxed"
            style={{ color: 'var(--muted)', marginBottom: 20 }}>
            {t(lang, 'home_subtitle')}
          </p>

          {/* Primary CTA — kiều hối là nút lớn */}
          <button
            onClick={() => onNavigate('remittance')}
            className="w-full flex items-center justify-center gap-2 rounded-2xl font-semibold
              transition-all hover:scale-[1.01] active:scale-[0.98]"
            style={{
              padding: '14px 20px', fontSize: 15,
              background: 'var(--accent)', color: 'white',
              boxShadow: '0 6px 20px rgba(26,111,255,0.30)',
            }}>
            <Send size={16} strokeWidth={1.8} />
            {t(lang, 'nav_send')}
          </button>

          {/* Fee promise */}
          <p className="text-center text-[11px] mt-2.5" style={{ color: 'var(--muted)' }}>
            Phí cố định ~$0.001 · Không ẩn · Arc EWMA
          </p>
        </div>
      </section>

      {/* ── Bảng tỷ giá tham chiếu ── */}
      <section className="glass-card rounded-3xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-bold uppercase"
            style={{ color: 'var(--subtle)', letterSpacing: '0.10em' }}>
            {t(lang, 'home_services_title').split('·')[1]?.trim() ?? 'Tỷ giá'}
          </span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          <span className="text-[10px] px-1.5 py-0.5 rounded-md"
            style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}>
            Demo
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {RATES.map(r => (
            <div key={r.flag} className="flex items-center gap-2.5 px-1 py-1.5 rounded-xl">
              <span style={{ fontSize: 18, lineHeight: 1 }}>{r.flag}</span>
              <span className="text-[12px] flex-1" style={{ color: 'var(--ink-2)' }}>{r.country}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px]" style={{ color: 'var(--muted)' }}>1 USDC →</span>
                <span className="mono text-[12px] font-semibold" style={{ color: 'var(--accent)' }}>
                  {r.rate} {r.to}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Thanh toán tại quầy (secondary) ── */}
      <button
        onClick={() => onNavigate('checkout')}
        className="glass-card rounded-2xl p-4 flex items-center gap-3.5 text-left
          transition-all hover:scale-[1.01] active:scale-[0.98] w-full">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent-soft)' }}>
          <ShoppingCart size={18} style={{ color: 'var(--accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
            {t(lang, 'home_checkout')}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
            {t(lang, 'home_checkout_desc')}
          </p>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--subtle)"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>

      {/* ── Onboarding / KYC banner ── */}
      {!isConnected ? (
        <div className="rounded-2xl px-4 py-3.5 flex gap-3 items-center"
          style={{ background: 'var(--accent-soft)', border: '1px solid rgba(26,111,255,0.14)' }}>
          <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
            style={{ background: 'var(--accent)' }}>
            <User size={15} color="white" />
          </div>
          <p className="text-[13px] font-medium leading-snug flex-1" style={{ color: 'var(--ink)' }}>
            {t(lang, 'home_connect_hint')}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl px-4 py-3.5 flex gap-3 items-center cursor-pointer
          hover:scale-[1.01] active:scale-[0.99] transition-transform"
          onClick={() => onNavigate('settings')}
          style={{ background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(217,119,6,0.22)' }}>
          <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
            style={{ background: 'rgba(217,119,6,0.15)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold" style={{ color: '#92400e' }}>
              {t(lang, 'kyc_prompt_title')}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: '#b45309' }}>
              {t(lang, 'kyc_prompt_desc')}
            </p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>
      )}

      {/* ── Faucet ── */}
      <FaucetButton lang={lang} />
    </div>
  )
}

// ── Root App ─────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [lang, setLang] = useState<LangCode>('vi')
  const [dark, setDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  // Sync .dark class on <html> for CSS variables
  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [dark])

  const NAV_ITEMS: { id: Tab; label: string; icon: typeof Home }[] = [
    { id: 'home',       label: t(lang, 'nav_home'),     icon: Home },
    { id: 'remittance', label: t(lang, 'nav_send'),     icon: Send },
    { id: 'checkout',   label: t(lang, 'nav_pay'),      icon: ShoppingCart },
    { id: 'bridge',     label: t(lang, 'nav_bridge'),   icon: ArrowDownToLine },
    { id: 'settings',   label: t(lang, 'nav_settings'), icon: Settings },
  ]

  return (
    <div className={`relative min-h-dvh theme-transition`}
      style={{ background: 'var(--bg)', backgroundImage: 'var(--bg-gradient)', backgroundAttachment: 'fixed' }}>
      <WaveBg dark={dark} />

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between"
        style={{
          background: 'var(--header-bg)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          borderBottom: '1px solid var(--border)',
        }}>
        <LogoWithFallback variant="full" height={34} darkMode={dark} />
        <div className="flex items-center gap-2">
          {/* Dark mode toggle */}
          <button
            onClick={() => setDark(d => !d)}
            aria-label={dark ? 'Chuyển sang sáng' : 'Chuyển sang tối'}
            className="flex items-center justify-center rounded-xl transition-all hover:scale-[1.08] active:scale-[0.94]"
            style={{
              width: 34, height: 34,
              background: dark ? 'rgba(77,163,255,0.15)' : 'rgba(26,111,255,0.10)',
              border: '1px solid var(--border)',
              color: 'var(--accent)',
            }}>
            {dark ? <Sun size={15} strokeWidth={2} /> : <Moon size={15} strokeWidth={1.8} />}
          </button>
          <LangPicker lang={lang} onChangeLang={setLang} />
          {/* ConnectKit — dùng custom trigger để ẩn chữ "Connect Wallet" thô */}
          <ConnectKitButton.Custom>
            {({ isConnected, show, truncatedAddress, ensName }) => (
              <button
                onClick={show}
                className="flex items-center gap-2 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.97]"
                style={{
                  padding: isConnected ? '6px 12px 6px 8px' : '7px 14px',
                  background: isConnected ? 'var(--surface-muted)' : 'var(--accent)',
                  border: isConnected ? '1px solid var(--border)' : 'none',
                  color: isConnected ? 'var(--ink)' : 'white',
                  fontSize: 13,
                  fontWeight: 600,
                }}>
                {isConnected ? (
                  <>
                    {/* Avatar circle */}
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: 'var(--accent)', color: 'white', fontSize: 10, fontWeight: 700 }}>
                      {(ensName ?? truncatedAddress ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <span className="mono text-[12px]">{ensName ?? truncatedAddress}</span>
                  </>
                ) : (
                  <>
                    <User size={14} />
                    <span>Đăng nhập</span>
                  </>
                )}
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="relative z-10 max-w-md mx-auto px-4 pt-5 pb-28">
        {activeTab === 'home'       && <HomeScreen lang={lang} dark={dark} onNavigate={setActiveTab} />}
        {activeTab === 'remittance' && <RemittanceScreen lang={lang} />}
        {activeTab === 'checkout'   && <CheckoutScreen lang={lang} />}
        {activeTab === 'bridge'     && <BridgeScreen lang={lang} />}
        {activeTab === 'settings'   && <SettingsScreen lang={lang} onChangeLang={setLang} onNavigate={tab => setActiveTab(tab as Tab)} />}
      </main>

      {/* ── Bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-20"
        style={{
          background: 'var(--nav-bg)',
          backdropFilter: 'blur(28px) saturate(160%)',
          WebkitBackdropFilter: 'blur(28px) saturate(160%)',
          borderTop: '1px solid var(--border)',
        }}>
        {/* Safe-area spacer for mobile */}
        <div className="flex justify-around items-stretch px-0.5 pt-1.5 pb-2"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="flex flex-col items-center gap-[4px] transition-all duration-150"
                style={{ minWidth: 44, padding: '5px 8px 4px' }}>
                <div className="flex items-center justify-center rounded-xl transition-all duration-150"
                  style={{
                    width: 36, height: 26,
                    background: active ? 'var(--accent-soft)' : 'transparent',
                  }}>
                  <Icon
                    size={16}
                    strokeWidth={active ? 2.4 : 1.7}
                    style={{ color: active ? 'var(--accent)' : 'var(--subtle)' }}
                  />
                </div>
                <span style={{
                  fontSize: 9,
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--accent)' : 'var(--subtle)',
                  lineHeight: 1,
                  letterSpacing: active ? '-0.01em' : '0',
                  whiteSpace: 'nowrap',
                }}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
