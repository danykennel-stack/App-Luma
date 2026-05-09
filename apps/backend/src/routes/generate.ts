import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.get('/missions', authMiddleware, async (req: Request, res: Response) => {
  const jobTitle = req.query.jobTitle as string;
  if (!jobTitle?.trim()) return res.status(400).json({ error: 'jobTitle requis' });

  try {
    const searchResp = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
      tool_choice: { type: 'tool', name: 'web_search' },
      messages: [{ role: 'user', content: `fiche de poste ${jobTitle} missions responsabilités` }],
    });

    const searchText = searchResp.content
      .map(b => b.type === 'text' ? b.text : '')
      .join('\n').slice(0, 6000);

    const extractResp = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Résultats pour le poste "${jobTitle}":\n\n${searchText}\n\nExtrait 6 missions spécifiques à ce poste.\nChaque mission: verbe infinitif + complément, max 12 mots.\nRéponds UNIQUEMENT avec ce JSON sans markdown:\n{"missions":["mission1","mission2","mission3","mission4","mission5","mission6"]}`,
      }],
    });

    const raw = extractResp.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return res.json({ missions: parsed.missions });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

const generateSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  jobTitle: z.string(),
  currentCompany: z.string().optional(),
  experiences: z.string(),
  education: z.string(),
  skills: z.string(),
  languages: z.string().optional().default(''),
  qualities: z.string(),
  targetCompany: z.string().optional(),
  targetPosition: z.string(),
  objectives: z.string().optional().default(''),
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const input = generateSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
    if (user.plan === 'FREE' && user.generationsUsed >= 3) {
      return res.status(403).json({ error: 'Limite atteinte', code: 'UPGRADE_REQUIRED' });
    }

    const [cvResp, letterResp] = await Promise.all([
      client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Génère un CV professionnel pour ${input.firstName} ${input.lastName}, poste visé: ${input.targetPosition}. Missions: ${input.experiences}. Formation: ${input.education}. Compétences: ${input.skills}. Qualités: ${input.qualities}.\nRéponds UNIQUEMENT en JSON sans markdown:\n{"profile":"...","experiences":[{"title":"","company":"","period":"","bullets":[""]}],"education":[{"degree":"","school":"","period":""}],"skills":[""],"languages":[{"language":"","level":""}]}`,
        }],
      }),
      client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Rédige une lettre de motivation professionnelle pour ${input.firstName} ${input.lastName} qui postule à ${input.targetPosition}${input.targetCompany ? ` chez ${input.targetCompany}` : ''}. Expérience: ${input.jobTitle}. Compétences: ${input.skills}. Qualités: ${input.qualities}. 250-300 mots, sans markdown.`,
        }],
      }),
    ]);

    const cvRaw = cvResp.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
    const cvStart = cvRaw.indexOf('{');
    const cvEnd = cvRaw.lastIndexOf('}');
    const cvContent = cvRaw.slice(cvStart, cvEnd + 1);
    const coverLetter = letterResp.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');

    const document = await prisma.document.create({
      data: {
        userId,
        title: `${input.targetPosition} — ${input.firstName} ${input.lastName}`,
        type: 'BOTH',
        status: 'COMPLETED',
        input​​​​​​​​​​​​​​​​
