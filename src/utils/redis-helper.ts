import type Redis from 'ioredis'

export interface RedisSecretItem {
  ciphertext: string
  iv: string
  passwordHash: string | null
  views: number
  maxViews: number | null
  destroyed: boolean
  userId: string | null
  isPlayground?: boolean
}

export type RedisSecretFetchResult =
  | { status: 'NOT_FOUND' }
  | { status: 'INVALID_PASSWORD' }
  | { status: 'SUCCESS'; item: RedisSecretItem }

const CONSUME_SECRET_LUA = `
  local key = KEYS[1]
  local providedHash = ARGV[1]
  local raw = redis.call('get', key)
  if not raw then
    return '404'
  end
  local item = cjson.decode(raw)
  if item.passwordHash and item.passwordHash ~= cjson.null and item.passwordHash ~= providedHash then
    return '401'
  end
  item.views = item.views + 1
  local ttl = redis.call('ttl', key)
  if ttl < 0 then
    ttl = 3600
  end
  local isDestroyed = item.maxViews ~= nil and item.views >= item.maxViews
  if isDestroyed then
    redis.call('del', key)
  else
    redis.call('set', key, cjson.encode(item), 'EX', ttl)
  end
  return cjson.encode({
    ciphertext = item.ciphertext,
    iv = item.iv,
    passwordHash = item.passwordHash,
    views = item.views,
    maxViews = item.maxViews,
    destroyed = isDestroyed,
    userId = item.userId,
    isPlayground = item.isPlayground
  })
`

/**
 * Atomically retrieves a secret from Redis, validates the password hash,
 * increments the view count, and deletes the secret if the max view limit is reached.
 * This prevents race conditions where concurrent requests could read a secret multiple times.
 */
export async function getAndConsumeSecret(
  redis: Redis,
  id: string,
  providedHash: string | null
): Promise<RedisSecretFetchResult> {
  const result = await redis.eval(
    CONSUME_SECRET_LUA,
    1,
    `item:${id}`,
    providedHash ?? ''
  )

  if (result === '404') {
    return { status: 'NOT_FOUND' }
  }
  if (result === '401') {
    return { status: 'INVALID_PASSWORD' }
  }

  const item = JSON.parse(result as string) as RedisSecretItem
  return { status: 'SUCCESS', item }
}
