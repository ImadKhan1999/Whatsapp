// ETEA: roll number slip lookup. Placeholder until the official source is provided.
// Planned flow: ask for CNIC (or registration no.) -> look up -> reply with roll no / slip link.
export const rollNumber = {
  id: 'rollno',
  menu: '1',
  speed: 'fast', // people use this most: answer quicker
  title: 'Roll number slip',
  match: /\broll\s*(no|number|slip)?\b/i,
  handle: () =>
    'Roll number lookup is coming soon. For now, please check the official ETEA website (etea.edu.pk).\n\nSend *0* for the menu.',
};
