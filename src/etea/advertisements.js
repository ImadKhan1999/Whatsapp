// ETEA: currently open advertisements / jobs. Placeholder until the data source is provided.
export const advertisements = {
  id: 'ads',
  menu: '2',
  title: 'Current advertisements',
  match: /\b(ads?|advertisements?|jobs?|posts?)\b/i,
  handle: () =>
    'The list of current ETEA advertisements is coming soon. For now, please check etea.edu.pk.\n\nSend *0* for the menu.',
};
