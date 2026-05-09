import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
  const docs = await prisma.document.findMany({
    where: { userId: (req as AuthRequest).userId },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ documents: docs });
});

router.get('/:id', async (req: Request, res: Response) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, userId: (req as AuthRequest).userId },
  });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  return res.json({ document: doc });
});

router.delete('/:id', async (req: Request, res: Response) => {
  await prisma.document.deleteMany({
    where: { id: req.params.id, userId: (req as AuthRequest).userId },
  });
  return res.json({ ok: true });
});

export default router;
