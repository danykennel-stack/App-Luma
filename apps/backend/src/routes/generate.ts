const { Router } = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { prisma } = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

const router = Router();
const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

router.get('/missions', authMiddleware, async (req, res) => {
  const jobTitle = req.query.jobTitle;
  if (!jobTitle) return res.status(400).json({ error: 'jobTitle requis' });
  try {
    const searchResp = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
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
        content: `Résultats pour "${jobTitle}":\n\n${searchText}\n\nExtrait 6 missions spécifiques.\nVerbe infinitif + complément, max 12 mots.\nJSON uniquement sans markdown:\n{"missions":["m1","m2","m3","m4","m5","m6"]}`,
      }],
    });
    const raw = extractResp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return res.json({ missions: parsed.missions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { firstName, lastName, jobTitle, currentCompany, experiences,
      education, skills, languages, qualities, targetCompany, targetPosition, objectives } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
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
          content: `Génère un CV pour ${firstName} ${lastName}, poste: ${targetPosition}. Missions: ${experiences}. Formation: ${education}. Compétences: ${skills}. Qualités: ${qualities}.\nJSON uniquement sans markdown:\n{"profile":"...","experiences":[{"title":"","company":"","period":"","bullets":[""]}],"education":[{"degree":"","school":"","period":""}],"skills":[""],"languages":[{"language":"","level":""}]}`,
        }],
      }),
      client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Lettre de motivation pour ${firstName} ${lastName}, poste: ${targetPosition}${targetCompany ? ` chez ${targetCompany}` : ''}. Expérience: ${jobTitle}. Compétences: ${skills}. 250-300 mots, sans markdown.`,
        }],
      }),
    ]);

    const cvRaw = cvResp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const cvContent = cvRaw.slice(cvRaw.indexOf('{'), cvRaw.lastIndexOf('}') + 1);
    const coverLetter = letterResp.content.filter(b => b.type === 'text').map(b => b.text).join('');

    const document = await prisma.document.create({
      data: {
        userId: req.userId,
        title: `${targetPosition} — ${firstName} ${lastName}`,
        type: 'BOTH',
        status: 'COMPLETED',
        inputData: req.body,
        cvContent,
        coverLetter,
      },
    });

    await prisma.user.update({
      where: { id: req.userId },
      data: { generationsUsed: { increment: 1 } },
    });

    return res.json({ document });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
