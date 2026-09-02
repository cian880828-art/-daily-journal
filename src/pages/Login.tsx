interface Props {
  onSignIn: () => void
}

export function Login({ onSignIn }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <p className="text-2xl font-semibold text-stone-800 mb-2">認識自己</p>
      <p className="text-sm text-stone-500 mb-10">Daily Journal</p>
      <p className="text-sm text-stone-500 mb-8 max-w-xs leading-relaxed">
        登入後，日記會存到雲端，換裝置也看得到，也才能設定準時提醒。
      </p>
      <button
        type="button"
        onClick={onSignIn}
        className="btn-primary px-8 flex items-center gap-2"
      >
        使用 Google 登入
      </button>
    </div>
  )
}
