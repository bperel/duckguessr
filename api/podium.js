const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

export default async (req, res) => {
  switch (req.method) {
    case 'GET': {
      const players = await prisma.$queryRaw`
        SELECT player.*, sum(score + speed_bonus) AS sum_score
        FROM player
        INNER JOIN round_score ON player.id = round_score.player_id
        WHERE username NOT like 'bot_%' and username NOT LIKE 'user%'
        GROUP BY player.id
        HAVING sum_score > 0
        ORDER BY sum_score DESC
      `
      res.writeHeader(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          players,
        })
      )
      break
    }
  }
}
