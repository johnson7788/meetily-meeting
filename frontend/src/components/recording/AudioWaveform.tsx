export default function AudioWaveform() {
  return (
    <div className="flex items-center gap-1 h-8">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="w-1 bg-red-500 rounded-full animate-waveform"
          style={{
            height: '100%',
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  )
}
