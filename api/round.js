import { addAxiosInterceptor } from './axiosApiInterceptor'

const request = require('request').defaults({ encoding: null })
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

addAxiosInterceptor()

const numberOfRounds = 9

async function getStartedRound(gameId, finished) {
  return await prisma.rounds.findFirst({
    include: {
      round_scores: true,
    },
    where: {
      game_id: parseInt(gameId),
      started_at: { not: null },
      finished_at: finished ? { not: null } : null,
    },
    orderBy: {
      round_number: finished ? 'desc' : 'asc',
    },
  })
}

export default async (req, res) => {
  const [, gameId, action] = req.url.split('/')
  if (!gameId) {
    res.statusCode = 400
    res.end()
    return
  }
  let round = await getStartedRound(gameId, false)
  switch (req.method) {
    case 'POST': {
      switch (action) {
        case 'finish': {
          let finishedRound
          if (round) {
            finishedRound = await prisma.rounds.update({
              include: {
                round_scores: true,
              },
              data: {
                finished_at: new Date(),
              },
              where: {
                id: round.id,
              },
            })
            if (finishedRound.round_number === numberOfRounds - 1) {
              await prisma.games.update({
                data: {
                  finished_at: new Date(),
                },
                where: {
                  id: round.game_id,
                },
              })
            }
          }
          round = finishedRound || (await getStartedRound(gameId, true))
          const { round_scores: roundScores } = round
          res.writeHeader(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              roundScores,
            })
          )
        }
      }
      break
    }
    case 'GET':
      switch (action) {
        case undefined: {
          if (!round) {
            res.writeHeader(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                round_scores: prisma.round_scores.findMany({
                  where: {
                    game_id: gameId,
                  },
                }),
              })
            )
            return
          }
          const cloudinaryUrl = `https://res.cloudinary.com/dl7hskxab/image/upload/v1623338718/inducks-covers/${round.entryurl_url}`
          request.get(cloudinaryUrl, function (error, response, body) {
            if (!error && response.statusCode === 200) {
              try {
                const buffer = Buffer.from(body)
                const base64 = `data:${
                  response.headers['content-type']
                };base64,${buffer.toString('base64')}`
                res.writeHeader(200, { 'Content-Type': 'application/json' })
                res.end(
                  JSON.stringify({
                    gameId,
                    roundNumber: round.round_number,
                    base64,
                  })
                )
              } catch (e) {
                res.statusCode = 404
                res.end()
              }
            } else {
              res.statusCode = response.statusCode
              res.end()
            }
          })
        }
      }
      break
  }
}
