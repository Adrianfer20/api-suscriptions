export type TemplateName =
  | 'subscription_reminder_3days_2v'
  | 'subscription_suspended_notice_2v'
  | 'subscription_cutoff_day_2v'
  | string;

type TemplateDefinition = {
  name: string;
  contentSid: string;
  variables: string[];
};

export const templates: Record<string, TemplateDefinition> = {
  subscription_reminder_3days_2v: {
    name: 'subscription_reminder_3days_2v',
    contentSid: 'HXfcc8ae438db9df662a0e1f7d801e946b',
    variables: ['name', 'dueDate']
  },
  subscription_suspended_notice_2v: {
    name: 'subscription_suspended_notice_2v',
    contentSid: 'HX9954143348c57d5cfb1daf4b5ab8ee6b',
    variables: ['name', 'subscriptionLabel']
  },
  subscription_cutoff_day_2v: {
    name: 'subscription_cutoff_day_2v',
    contentSid: 'HX416f989f4eb0c55836464269165eece0',
    variables: ['name', 'subscriptionLabel', 'cutoffDate']
  }
};

export const allowedTemplates = Object.freeze(Object.keys(templates));

export function getMissingTemplateVariables(templateName: TemplateName, data: Record<string, unknown> = {}) {
  const template = templates[templateName];
  if (!template) throw new Error('Template not found');
  return template.variables.filter((key) => {
    const value = data[key];
    if (value === null || value === undefined) return true;
    return String(value).trim() === '';
  });
}

export function renderTemplateParams(templateName: TemplateName, data: Record<string, unknown> = {}) {
  const template = templates[templateName];
  if (!template) throw new Error('Template not found');
  return template.variables.map((key) => String(data[key] ?? ''));
}

export function renderContentVariables(templateName: TemplateName, data: Record<string, unknown> = {}) {
  const template = templates[templateName];
  if (!template) throw new Error('Template not found');
  const out: Record<string, string> = {};
  template.variables.forEach((key, index) => {
    out[String(index + 1)] = String(data[key] ?? '');
  });
  return out;
}

export default templates;
