// ─── Toast ───────────────────────────────────────────────
export default function Toast({ msg }) {
  if (!msg) return null;
  const colors = {
    default: '#4ade80',
    error:   '#f87171',
    info:    '#60a5fa',
    warning: '#fbbf24',
  };
  const col = colors[msg.type] || colors.default;
  return (
    <div style={{
      position:'fixed', bottom:24, right:24, zIndex:9999,
      background:'#18181b', border:`1px solid #3f3f46`,
      borderLeft: `3px solid ${col}`,
      borderRadius:12, padding:'13px 18px', maxWidth:320,
      animation:'slideUp .3s ease',
      boxShadow:'0 8px 32px rgba(0,0,0,.4)',
    }}>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ fontSize:13, fontWeight:500, color:'#fafafa', marginBottom:3 }}>{msg.title}</div>
      {msg.body && <div style={{ fontSize:12, color:'#a1a1aa' }}>{msg.body}</div>}
    </div>
  );
}
