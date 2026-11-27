export const menuText = (handlers) => {
  const items = handlers.filter((h) => h.menu).map((h) => `*${h.menu}.* ${h.title}`).join('\n');
  return `Assalam o Alaikum! 👋 I'm the ETEA help bot.\n\nReply with a number:\n${items}\n\nSend *0* or *menu* any time to come back here.`;
};

export const menu = {
  id: 'menu',
  title: 'Main menu',
  match: /^(hi+|hello|hey|salam|assalam.*|aoa|menu|start|help|0)$/i,
  handle: (ctx) => menuText(ctx.handlers),
};
