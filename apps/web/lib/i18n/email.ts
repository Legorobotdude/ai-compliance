export type Locale = "en" | "de" | "zh";

const templates: Record<Locale, { subject: string; body: (ctx: { supplier: string; missingCount: number; regulation: string }) => string }> = {
  en: {
    subject: "Action requested: compliance evidence refresh",
    body: ({ supplier, missingCount, regulation }) =>
      `Hi ${supplier} team,\n\nWe detected ${missingCount} parts without current documentation for the upcoming ${regulation} submission. Please upload refreshed declarations or flag blockers so CORA can triage.\n\nThank you,\nCertivo Ops`
  },
  de: {
    subject: "Aktion erforderlich: Nachweis aktualisieren",
    body: ({ supplier, missingCount, regulation }) =>
      `Hallo Team ${supplier},\n\nFür ${missingCount} Teile fehlen Unterlagen im Rahmen der ${regulation}-Meldung. Bitte aktualisierte Konformitätserklärungen bereitstellen oder über Hürden informieren, damit CORA priorisieren kann.\n\nVielen Dank,\nCertivo Ops`
  },
  zh: {
    subject: "请更新合规材料",
    body: ({ supplier, missingCount, regulation }) =>
      `尊敬的 ${supplier} 团队：\n\n针对即将提交的 ${regulation}，我们有 ${missingCount} 个零件缺少最新证明。请尽快上传最新文件或告知阻碍，方便 CORA 分流。\n\n谢谢，\nCertivo 运维团队`
  }
};

export function getEmailPreview(locale: Locale, ctx: { supplier: string; missingCount: number; regulation: string }) {
  const template = templates[locale] ?? templates.en;
  return {
    locale,
    subject: template.subject,
    body: template.body(ctx)
  };
}
