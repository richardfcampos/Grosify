import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/dexie.js';
import { createComment, deleteComment } from '../../db/repositories.js';
import { useSession } from '../../lib/auth-client.js';

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
      <span className="text-sm font-medium text-zinc-600">{t('comments.title')}</span>
      {sorted.length > 0 && (
        <ul className="flex flex-col gap-2">
          {sorted.map((c) => (
            <li key={c.id} className="rounded-xl bg-zinc-100 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-600">{c.authorName ?? '—'}</span>
                <button onClick={() => deleteComment(c.id)} className="text-xs text-red-500">
                  {t('common.delete')}
                </button>
              </div>
              <p className="text-sm text-zinc-800">{c.body}</p>
              <p className="text-[10px] text-zinc-400">{fmtDate(c.updatedAt)}</p>
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
          className="min-h-11 flex-1 rounded-xl border border-zinc-300 px-4 py-2.5 text-base"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          className="shrink-0 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {t('comments.send')}
        </button>
      </div>
    </div>
  );
}
