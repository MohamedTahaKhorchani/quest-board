// Development-only sample quests. Never used in production builds and never talks
// to the real API. Data lives in sessionStorage under a dedicated key so it cannot
// mix with real accounts or live requests.

const STORAGE_KEY = "questboard.demo.quests.v2";

function atLocalDay(offsetDays, startHour, startMinute, endHour, endMinute) {
  const start = new Date();
  start.setDate(start.getDate() + offsetDays);
  start.setHours(startHour, startMinute, 0, 0);
  const end = new Date(start);
  end.setHours(endHour, endMinute, 0, 0);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

function seedData() {
  const today = atLocalDay(0, 16, 0, 18, 0);
  const tomorrow = atLocalDay(1, 12, 30, 14, 0);
  const midWeek = atLocalDay(3, 14, 0, 16, 30);
  const weekend = atLocalDay(5, 10, 0, 12, 0);
  const nextWeek = atLocalDay(8, 17, 0, 19, 0);
  const later = atLocalDay(12, 15, 0, 17, 0);

  return {
    nextQuestId: 8,
    nextParticipationId: 2,
    quests: [
      {
        id: "demo-1",
        title: "Campus cleanup",
        description: "Pick up litter around the library and the Quai. Bags and gloves provided.",
        location: "Quai d'Orsay",
        ...midWeek,
        timeZone: "Europe/Paris",
        category: "Volunteering",
        proofInstructions: "A photo of your full bag.",
        points: 50,
        status: "published",
        organizerId: "demo-organizer",
      },
      {
        id: "demo-2",
        title: "Chess night",
        description: "Casual games in the student lounge. All levels welcome — bring a friend or come solo.",
        location: "Student lounge",
        ...tomorrow,
        timeZone: "Europe/Paris",
        category: "Culture",
        proofInstructions: "Ask the host to stamp your board.",
        points: 25,
        status: "published",
        organizerId: "demo-organizer",
      },
      {
        id: "demo-3",
        title: "Photo walk draft",
        description: "An afternoon walk to photograph campus landmarks.",
        location: "Main courtyard",
        ...midWeek,
        timeZone: "Europe/Paris",
        category: "Arts",
        proofInstructions: "Share three photos in the club chat.",
        points: 40,
        status: "draft",
        organizerId: "demo-organizer",
      },
      {
        id: "demo-4",
        title: "Pickup football",
        description: "Friendly match on the grass behind Combes. Cleats optional; shin guards recommended.",
        location: "Combes field",
        ...today,
        timeZone: "Europe/Paris",
        category: "Sports",
        proofInstructions: "Check in with the captain at kickoff.",
        points: 30,
        status: "published",
        organizerId: "demo-organizer",
      },
      {
        id: "demo-5",
        title: "Study sprint: midterms",
        description: "Quiet focus block with pomodoro timers and shared whiteboards.",
        location: "Library room B",
        ...weekend,
        timeZone: "Europe/Paris",
        category: "Academic",
        proofInstructions: "Sign the attendance sheet before you leave.",
        points: 20,
        status: "published",
        organizerId: "demo-organizer",
      },
      {
        id: "demo-6",
        title: "Gallery opening night",
        description: "Student exhibition opening with short artist talks and light refreshments.",
        location: "AMEX gallery",
        ...nextWeek,
        timeZone: "Europe/Paris",
        category: "Arts",
        proofInstructions: "Get a sticker at the door.",
        points: 35,
        status: "published",
        organizerId: "demo-organizer",
      },
      {
        id: "demo-7",
        title: "Neighborhood food walk",
        description: "Sample a few neighborhood spots and compare notes afterward on campus.",
        location: "Meet at main gate",
        ...later,
        timeZone: "Europe/Paris",
        category: "Social",
        proofInstructions: "Share one recommendation in the group chat.",
        points: 40,
        status: "published",
        organizerId: "demo-organizer",
      },
    ],
    // Map of userId -> [questId, ...]
    joinedByUser: {},
  };
}

function readStore() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedData();
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw);
  } catch {
    const seeded = seedData();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function writeStore(store) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function delay(result) {
  // Small delay so loading states are visible during demos.
  return new Promise((resolve) => {
    setTimeout(() => resolve(result), 180);
  });
}

export function resetDemoQuests() {
  sessionStorage.removeItem(STORAGE_KEY);
  return delay(seedData());
}

export function demoListPublishedQuests() {
  const store = readStore();
  return delay(store.quests.filter((quest) => quest.status === "published"));
}

export function demoListMyQuests() {
  const store = readStore();
  // Demo mode shows every sample draft/published item as "mine".
  return delay([...store.quests].reverse());
}

export function demoCreateQuest(fields) {
  const store = readStore();
  const quest = {
    id: `demo-${store.nextQuestId++}`,
    title: fields.title,
    description: fields.description,
    location: fields.location,
    startsAt: fields.starts_at,
    endsAt: fields.ends_at,
    timeZone: fields.time_zone || "Europe/Paris",
    category: fields.category,
    proofInstructions: fields.proof_instructions,
    points: fields.point_value ?? fields.points,
    status: "draft",
    organizerId: "demo-organizer",
  };
  store.quests.push(quest);
  writeStore(store);
  return delay(quest);
}

export function demoPublishQuest(questId) {
  const store = readStore();
  const quest = store.quests.find((item) => item.id === questId);
  if (!quest) {
    return Promise.reject(Object.assign(new Error("Quest not found"), { status: 404 }));
  }
  if (quest.status === "published") {
    return Promise.reject(
      Object.assign(new Error("Quest already published"), {
        status: 409,
        code: "quest_already_published",
      })
    );
  }
  quest.status = "published";
  writeStore(store);
  return delay({ ...quest });
}

export function demoListMyParticipations(userId) {
  const store = readStore();
  const ids = store.joinedByUser[userId] || [];
  return delay(
    ids.map((questId, index) => ({
      id: `demo-p-${index + 1}`,
      questId,
      status: "joined",
      joinedAt: new Date().toISOString(),
    }))
  );
}

export function demoJoinQuest(questId, userId) {
  const store = readStore();
  const quest = store.quests.find((item) => item.id === questId && item.status === "published");
  if (!quest) {
    return Promise.reject(Object.assign(new Error("Quest not found"), { status: 404 }));
  }
  const ids = store.joinedByUser[userId] || [];
  if (ids.includes(questId)) {
    return Promise.reject(
      Object.assign(new Error("You already joined this quest."), {
        status: 409,
        code: "quest_already_joined",
      })
    );
  }
  store.joinedByUser[userId] = [...ids, questId];
  writeStore(store);
  return delay({
    id: `demo-p-${store.nextParticipationId++}`,
    questId,
    status: "joined",
    joinedAt: new Date().toISOString(),
  });
}
