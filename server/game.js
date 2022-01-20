const { PrismaClient } = require('@prisma/client')
const { runQuery } = require('../api/runQuery')

const prisma = new PrismaClient()
const numberOfRounds = 8

exports.createOrGetPending = async (gameType, datasetName) => {
  const dataset = await prisma.datasets.findFirst({
    where: {
      name: datasetName,
    },
  })
  if (!dataset) {
    throw new Error(`Cannot find dataset with name ${datasetName}`)
  }
  const pendingGame = await prisma.games.findFirst({
    include: {
      game_players: true,
    },
    where: {
      game_type: gameType,
      dataset_id: dataset.id,
      rounds: {
        some: {
          started_at: null,
          round_number: 0,
        },
      },
    },
  })
  if (pendingGame) {
    return { gameId: pendingGame.id, created: false }
  }

  const roundDataResponse = await prisma.$queryRaw`
    SELECT datasets_entryurls.personcode, sitecode_url
    FROM datasets_entryurls
    INNER JOIN (
      SELECT DISTINCT personcode
      FROM datasets_entryurls
      WHERE dataset_id = 1
      ORDER BY RAND()
    ) random_authors ON random_authors.personcode = datasets_entryurls.personcode
    WHERE dataset_id = 1
    GROUP BY datasets_entryurls.personcode
    ORDER BY RAND()
    LIMIT ${numberOfRounds + 1}
  `

  if (roundDataResponse) {
    const rounds = roundDataResponse
      .map((roundData, roundNumber) => ({
        ...roundData,
        round_number: roundNumber + 1,
      }))
      .filter(({ round_number: roundNumber }) => roundNumber <= numberOfRounds)
    const game = await prisma.games.create({
      data: {
        game_type: gameType,
        rounds: {
          create: rounds,
        },
      },
    })

    return { gameId: game.id, created: true }
  } else {
    throw new Error(`Couldn't find rounds for dataset ${dataset.id}`)
  }
}

exports.associatePlayer = async (gameId, username, password) => {
  let user
  if (/^user[0-9]+$/.test(username) || /^bot_.+$/.test(username)) {
    user = await prisma.players.findFirst({
      where: {
        username,
      },
    })
    if (!user) {
      user = await prisma.players.create({
        data: {
          username,
        },
      })
    }
  } else {
    const [dmUser] = (
      await runQuery(
        'SELECT ID AS id, username from users where username=? AND password=?',
        'dm',
        [username, password]
      )
    ).data
    if (!dmUser) {
      console.error(`No DM user with username ${username}`)
      return null
    }
    user = await prisma.players.findFirst({
      where: {
        username,
      },
    })
    if (!user) {
      user = await prisma.players.create({
        data: {
          ducksmanager_id: parseInt(dmUser.id),
          username,
        },
      })
    }
  }
  const userId = user.id
  global.cachedUsers[userId] = user
  await prisma.game_players.create({
    data: {
      game_id: gameId,
      player_id: userId,
    },
  })

  return user
}
