import { Redis } from 'ioredis'

export const redis = new Redis(process.env.REDIS_URL!, {
    retryStrategy: (times: number) => {
        if (times > 3) return null
        return Math.min(times * 1000, 3000)
    }
})

export const subscriber = new Redis(process.env.REDIS_URL!, {
    retryStrategy: (times: number) => {
        if (times > 3) return null
        return Math.min(times * 1000, 3000)
    }
})

redis.on('connect', () => console.log('Redis connected'))
redis.on('error', (err: Error) => console.error('Redis error:', err.message))

subscriber.on('connect', () => console.log('Redis subscriber connected'))
subscriber.on('error', (err: Error) => console.error('Subscriber error:', err.message))