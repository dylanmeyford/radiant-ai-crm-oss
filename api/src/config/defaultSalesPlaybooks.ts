import { ContentType } from '../models/SalesPlaybook';

/**
 * Default sales playbook templates that are automatically seeded
 * when a new organization is created during signup.
 */
export interface DefaultSalesPlaybookTemplate {
  type: ContentType;
  title: string;
  content: string;
  contentSummary?: string;
  tags?: string[];
  keywords?: string[];
  useCase?: string;
}

export const defaultSalesPlaybooks: DefaultSalesPlaybookTemplate[] = [
  {
    type: ContentType.TEMPLATES,
    title: 'General Email formatting and language rules',
    content: `<p style="text-align: left;">In general, we want to:<br></p><ol><li><p style="text-align: left;">Keep our emails friendly, professional and to the point.</p></li><li><p style="text-align: left;">We refrain from using 'salesy' or overly corporate/sycophantic talk that sounds like common 'canned' phrases:</p><ul><li><p style="text-align: left;">e.g. We don't say 'I wanted to follow up and circle back…' or other cliche, templated language.</p></li><li><p style="text-align: left;">we never say "Just circling back" or similar</p></li></ul></li><li><p style="text-align: left;">Keep our emails easy to respond to. They focus on one key topic and make it simple for the other person to respond or opt out.</p></li></ol><p style="text-align: left;"></p>`,
    contentSummary: `Template: General Email formatting and language rules — a concise set of guidelines that helps sellers keep outreach friendly, professional, and to the point while avoiding canned, 'salesy' phrases (e.g., "Just circling back"). Use these rules for outbound and follow-up emails to focus each message on a single topic, make it easy for recipients to respond or opt out, and reduce friction in conversations to preserve credibility and momentum in the sales process.`,
    tags: [],
    keywords: [],
    useCase: '',
  },
  {
    type: ContentType.TEMPLATES,
    title: 'Ghost Busting/Breakup Email Template',
    content: `<p style="text-align: left;">Here are our favourite templates to use when a prospect has gone cold for a longer time period.<br><br>Hi NAME,</p><p style="text-align: left;">Last we spoke, you were assessing BePrepared to manage your clients digital assets.</p><p style="text-align: left;">However, as I haven't heard from you in some time, it seems as though although you were initially interested in solving digital assets for you clients,&nbsp;<span style="color: rgba(0, 0, 0, 0.9);">it seems something has changed on your end - is this correct?</span></p><p style="text-align: left;"><span style="color: rgba(0, 0, 0, 0.9);">I've made a note to reach out in the future to see how you're travelling, however for now I'll be closing off this account.&nbsp;</span></p><p style="text-align: left;"><span style="color: rgba(0, 0, 0, 0.9);">If I'm mistaken, you are still interested and work just got too busy - let me know and we can organise a time in NEXT_MONTH.</span></p><p style="text-align: left;"><span style="color: rgba(0, 0, 0, 0.9);">Kindest,</span><br><br><span style="color: rgba(0, 0, 0, 0.9);">OR</span><br><br><span style="color: rgba(0, 0, 0, 0.9);">Hey name,<br><br>When I don't hear back for a few weeks, typically it's a few reasons:<br><br>1.<strong> No-Go</strong> - you went in another direction + want us to give up<br><br>2. Not Now - Deprioritized this short-term, let us know when to loop back around</span></p><p style="text-align: left;"><span style="color: rgba(0, 0, 0, 0.9);"><br>3. <strong>I didn't respond!?!?</strong> - Life hit the fan, but you're now ready to connect<br><br>Mind sharing which bucket you fall into, so I can best support you and your team?<br></span></p><p style="text-align: left;">Kindest,<br><br></p>`,
    contentSummary: `This is a set of 'Ghost Busting/Breakup' email templates designed to help sellers re-engage or formally close out prospects who have gone cold, providing ready-made language to elicit a clear response. Use these short emails after prolonged silence to either surface whether the deal is a No-Go, simply Deprioritized, or still active so you can schedule a follow-up, close the opportunity, and free up selling capacity—improving pipeline hygiene and forecast accuracy.`,
    tags: [],
    keywords: [],
    useCase: '',
  },
];
