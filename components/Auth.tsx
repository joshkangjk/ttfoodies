import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Loader2, Mail } from 'lucide-react'

export default function Auth() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [otp, setOtp] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [sending, setSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  
  // Timer state for resend code
  const [timer, setTimer] = useState(0)

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Countdown effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timer > 0 && sent) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1)
      }, 1000)
    } else if (timer === 0) {
      clearInterval(interval)
    }
    return () => clearInterval(interval)
  }, [timer, sent])

  // Auto-submit effect
  useEffect(() => {
    if (otp.length === 6) {
      verifyOtp()
    }
  }, [otp])

  // Auto-focus the first OTP input when the screen switches
  useEffect(() => {
    if (sent) {
      setTimeout(() => {
        inputRefs.current[0]?.focus()
      }, 50)
    }
  }, [sent])

  async function sendOtp() {
    const clean = email.trim()
    if (!clean || sending) return

    setErrorMsg("")
    setSending(true)

    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
    })

    setSending(false)

    if (error) {
      setSent(false)
      setErrorMsg(error.message)
      return
    }

    setSent(true)
    setTimer(60) // Start the 60-second timer on success
  }

  async function verifyOtp() {
    if (!otp.trim() || verifying) return

    setVerifying(true)
    setErrorMsg("")

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: "email",
    })

    setVerifying(false)

    if (error) {
      setErrorMsg(error.message)
      return
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      const pastedCode = value.replace(/\D/g, "").slice(0, 6)
      setOtp(pastedCode)
      if (pastedCode.length > 0) {
        inputRefs.current[Math.min(pastedCode.length - 1, 5)]?.focus()
      }
      return
    }

    if (value && !/^\d$/.test(value)) return

    let newOtpArray = otp.split("")
    while (newOtpArray.length < 6) newOtpArray.push("")
    newOtpArray[index] = value
    
    const newOtp = newOtpArray.join("")
    setOtp(newOtp)

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 bg-gray-50">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!sent) sendOtp()
        }}
        className="w-full max-w-sm rounded-[32px] bg-white p-8 sm:p-10 shadow-sm border border-gray-100 flex flex-col gap-6"
      >
        <div className="flex flex-col items-center text-center space-y-2">
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">🍜 TTFoodie</h2>
          <p className="text-[15px] text-gray-500 max-w-[260px] leading-relaxed mx-auto">
            {sent ? "Enter the 6-digit code sent to your email." : "Enter your email to sign in to save places."}
          </p>
        </div>

        <div className="space-y-4">
          {!sent ? (
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                required
                inputMode="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (errorMsg) setErrorMsg("")
                }}
                className="h-14 w-full text-[15px] px-12 rounded-2xl bg-gray-50 border border-gray-200 focus-visible:outline-none focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all font-medium placeholder:text-gray-400"
              />
            </div>
          ) : (
            <div className="flex h-14 items-center justify-between px-5 rounded-2xl bg-gray-50 border border-gray-200 transition-all">
              <span className="text-[15px] font-medium text-gray-700 truncate mr-3">
                {email}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSent(false)
                  setOtp("")
                  setErrorMsg("")
                  setTimer(0)
                }}
                className="text-[13px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors whitespace-nowrap active:scale-95"
              >
                Change
              </button>
            </div>
          )}

          {/* 6-BOX OTP CODE */}
          {sent && (
            <div className="flex justify-between gap-2 mt-4">
              {[...Array(6)].map((_, index) => (
                <input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  value={otp[index] || ""}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  className="h-12 w-full text-center text-lg font-bold rounded-xl bg-gray-50 border border-gray-200 focus-visible:outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/40 transition-all p-0"
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {!sent && (
            <button
              type="submit"
              className="flex w-full h-14 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 active:scale-[0.98] transition-all font-bold text-[15px] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!email.trim() || sending}
            >
              {sending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Sending...
                </span>
              ) : (
                "Continue with Email"
              )}
            </button>
          )}

          {sent && verifying && (
            <div className="flex justify-center items-center py-3 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2 text-emerald-500" />
              <span className="text-[14px] font-medium">Verifying code...</span>
            </div>
          )}

          {errorMsg && (
            <div className="text-[13px] font-medium text-red-600 text-center bg-red-50 py-2 px-3 rounded-xl border border-red-100">
              {errorMsg}
            </div>
          )}

          {/* RESEND TIMER UI */}
          {sent && !verifying && (
             <div className="pt-2 text-center">
               <p className="text-[13px] text-gray-500 mb-1">
                 Didn't receive a code?
               </p>
               <button
                 type="button"
                 disabled={timer > 0 || sending}
                 onClick={sendOtp}
                 className="text-[13px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
               >
                 {sending ? "Sending..." : timer > 0 ? `Resend Code in ${timer}s` : "Resend Code"}
               </button>
             </div>
          )}
        </div>
      </form>
    </div>
  )
}
