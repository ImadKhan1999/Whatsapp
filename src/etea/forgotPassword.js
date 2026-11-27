// ETEA: forgot password guidance. Placeholder until the exact steps are provided.
export const forgotPassword = {
  id: 'forgot',
  menu: '3',
  speed: 'fast', // people use this most: answer quicker
  title: 'Forgot password',
  match: /\b(forgot|forget|reset)\b.*\bpass(word)?\b|\bpassword\b/i,
  handle: () =>
    'Step-by-step password reset help is coming soon. For now, use the "Forgot Password" link on the ETEA login page.\n\nSend *0* for the menu.',
};
