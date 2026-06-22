import { AwsClient } from 'aws4fetch';

/**
 * Assinatura de URLs do R2 (S3-compatível) via aws4fetch — sem aws-sdk pesado.
 * Tudo gated em env: sem credencial, `r2Enabled` é false e as rotas respondem 501,
 * o client cai no blob local. Liga sozinho quando as credenciais chegam.
 */

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;

export const r2Enabled = Boolean(accountId && accessKeyId && secretAccessKey && bucket);

const client = r2Enabled
  ? new AwsClient({
      accessKeyId: accessKeyId as string,
      secretAccessKey: secretAccessKey as string,
      service: 's3',
      region: 'auto',
    })
  : null;

const base = r2Enabled ? `https://${accountId}.r2.cloudflarestorage.com/${bucket}` : '';

async function presign(key: string, method: 'PUT' | 'GET', expiresSec: number): Promise<string> {
  if (!client) throw new Error('r2_disabled');
  const url = new URL(`${base}/${key}`);
  url.searchParams.set('X-Amz-Expires', String(expiresSec));
  const signed = await client.sign(url.toString(), { method, aws: { signQuery: true } });
  return signed.url;
}

/** URL presigned pra upload (PUT). Curta — só o tempo de subir o arquivo. */
export const presignPut = (key: string, expiresSec = 300): Promise<string> =>
  presign(key, 'PUT', expiresSec);

/** URL presigned pra download (GET). Bucket é privado; a URL expira. */
export const presignGet = (key: string, expiresSec = 3600): Promise<string> =>
  presign(key, 'GET', expiresSec);
