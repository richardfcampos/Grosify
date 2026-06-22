import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/dexie.js';
import { createComment, deleteComment } from '../../db/repositories.js';
import { useSession } from '../../lib/auth-client.js';
import { Button } from '../ui/index.js';

/** Comentários de um item (sincronizados): discussão entre membros da casa. */
export function CommentsSection({ itemId }: { itemId: string }) {
  const { t, i18n } = useTranslation();
  const { data: session } = useSession();
  const [text, setText] = useState('');

  const comments = useLiveQuery(
    () => db.comments.where('itemId').equals(itemId).filter((c) => c.deletedAt === null).toArray(),
    [itemId],
    [],
  );
  const sorted = [...comments].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.resolvedLanguage);

  async function send() {
    const body = text.trim();
    if (!body) return;
    await createComment(itemId, body, session?.user.id ?? null, session?.user.name ?? null);
    setText('');
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="muted text-sm font-medium">{t('comments.title')}</span>
      {sorted.length > 0 && (
        <ul className="flex flex-col gap-2">
          {sorted.map((c) => (
            <li key={c.id} className="rounded-xl px-3 py-2" style={{ background: 'var(--app-surface-2)' }}>
              <div className="flex items-center justify-between">
                <span className="muted text-xs font-semibold">{c.authorName ?? '—'}</span>
                <button
                  onClick={() => deleteComment(c.id)}
                  className="text-xs"
                  style={{ color: 'var(--gro-red)' }}
                >
                  {t('common.delete')}
                </button>
              </div>
              <p className="text-sm">{c.body}</p>
              <p className="muted text-[10px]">{fmtDate(c.updatedAt)}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('comments.placeholder')}
          maxLength={1000}
          className="gro-field"
        />
        <Button variant="primary" size="md" type="button" onClick={send} disabled={!text.trim()} className="shrink-0">
          {t('comments.send')}
        </Button>
      </div>
    </div>
  );
}
