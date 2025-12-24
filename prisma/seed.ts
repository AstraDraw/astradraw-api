/**
 * Development Seed Script
 *
 * Creates test users, workspaces, teams, collections, scenes, and sample comments
 * for development and testing purposes.
 *
 * Run with: npx prisma db seed
 * Or: just db-seed
 *
 * Test Users (all passwords: "Test123!"):
 *   - alice@test.local - Admin of "Acme Corp" workspace
 *   - bob@test.local   - Member with EDIT access to Engineering collection
 *   - carol@test.local - Member with VIEW access to Engineering collection
 *   - dave@test.local  - Workspace viewer (read-only)
 *   - eve@test.local   - External user (not in Acme Corp)
 */

import {
  PrismaClient,
  WorkspaceRole,
  WorkspaceType,
  CollectionAccessLevel,
  NotificationType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

const prisma = new PrismaClient();

// Test password for all seed users
const TEST_PASSWORD = 'Test123!';
const BCRYPT_SALT_ROUNDS = 12;

// User data
const USERS = [
  {
    email: 'alice@test.local',
    name: 'Alice Admin',
    description: 'Admin of Acme Corp workspace',
  },
  {
    email: 'bob@test.local',
    name: 'Bob Member',
    description: 'Member with EDIT access to Engineering',
  },
  {
    email: 'carol@test.local',
    name: 'Carol Designer',
    description: 'Member with VIEW access to Engineering, EDIT to Design',
  },
  {
    email: 'dave@test.local',
    name: 'Dave Viewer',
    description: 'Workspace viewer (read-only)',
  },
  {
    email: 'eve@test.local',
    name: 'Eve External',
    description: 'Not a member of Acme Corp',
  },
];

async function main() {
  console.log('🌱 Seeding database with test data...\n');

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_SALT_ROUNDS);

  // ==========================================================================
  // Phase 1: Create Users
  // ==========================================================================
  console.log('👤 Creating test users...');

  const users: Record<string, { id: string; email: string; name: string }> = {};

  for (const userData of USERS) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        name: userData.name,
        passwordHash,
      },
      create: {
        email: userData.email,
        name: userData.name,
        passwordHash,
      },
    });
    users[userData.email] = user;
    console.log(`   ✓ ${userData.name} (${userData.email})`);
  }

  const alice = users['alice@test.local'];
  const bob = users['bob@test.local'];
  const carol = users['carol@test.local'];
  const dave = users['dave@test.local'];
  const eve = users['eve@test.local'];

  // ==========================================================================
  // Phase 2: Create Workspaces
  // ==========================================================================
  console.log('\n🏢 Creating workspaces...');

  // Personal workspace for Alice
  const alicePersonal = await prisma.workspace.upsert({
    where: { slug: 'alice-personal' },
    update: {},
    create: {
      name: "Alice's Workspace",
      slug: 'alice-personal',
      type: WorkspaceType.PERSONAL,
    },
  });
  console.log(`   ✓ ${alicePersonal.name} (PERSONAL)`);

  // Personal workspace for Eve
  const evePersonal = await prisma.workspace.upsert({
    where: { slug: 'eve-personal' },
    update: {},
    create: {
      name: "Eve's Workspace",
      slug: 'eve-personal',
      type: WorkspaceType.PERSONAL,
    },
  });
  console.log(`   ✓ ${evePersonal.name} (PERSONAL)`);

  // Shared workspace: Acme Corp
  const acmeCorp = await prisma.workspace.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corp',
      slug: 'acme-corp',
      type: WorkspaceType.SHARED,
    },
  });
  console.log(`   ✓ ${acmeCorp.name} (SHARED)`);

  // ==========================================================================
  // Phase 3: Create Workspace Memberships
  // ==========================================================================
  console.log('\n👥 Creating workspace memberships...');

  // Alice is ADMIN of her personal workspace
  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: alicePersonal.id,
        userId: alice.id,
      },
    },
    update: { role: WorkspaceRole.ADMIN },
    create: {
      workspaceId: alicePersonal.id,
      userId: alice.id,
      role: WorkspaceRole.ADMIN,
    },
  });
  console.log(`   ✓ Alice → Alice's Workspace (ADMIN)`);

  // Eve is ADMIN of her personal workspace
  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: evePersonal.id,
        userId: eve.id,
      },
    },
    update: { role: WorkspaceRole.ADMIN },
    create: {
      workspaceId: evePersonal.id,
      userId: eve.id,
      role: WorkspaceRole.ADMIN,
    },
  });
  console.log(`   ✓ Eve → Eve's Workspace (ADMIN)`);

  // Acme Corp memberships
  const acmeMembers: Record<
    string,
    { id: string; userId: string; role: WorkspaceRole }
  > = {};

  const membershipData = [
    { user: alice, role: WorkspaceRole.ADMIN, label: 'Alice' },
    { user: bob, role: WorkspaceRole.MEMBER, label: 'Bob' },
    { user: carol, role: WorkspaceRole.MEMBER, label: 'Carol' },
    { user: dave, role: WorkspaceRole.VIEWER, label: 'Dave' },
  ];

  for (const { user, role, label } of membershipData) {
    const member = await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: acmeCorp.id,
          userId: user.id,
        },
      },
      update: { role },
      create: {
        workspaceId: acmeCorp.id,
        userId: user.id,
        role,
      },
    });
    acmeMembers[user.id] = member;
    console.log(`   ✓ ${label} → Acme Corp (${role})`);
  }

  // ==========================================================================
  // Phase 4: Create Teams
  // ==========================================================================
  console.log('\n🏷️  Creating teams...');

  const engineeringTeam = await prisma.team.upsert({
    where: { id: 'team-engineering' },
    update: {
      name: 'Engineering',
      color: '#3B82F6',
    },
    create: {
      id: 'team-engineering',
      name: 'Engineering',
      color: '#3B82F6',
      workspaceId: acmeCorp.id,
    },
  });
  console.log(`   ✓ Engineering (${engineeringTeam.color})`);

  const designTeam = await prisma.team.upsert({
    where: { id: 'team-design' },
    update: {
      name: 'Design',
      color: '#EC4899',
    },
    create: {
      id: 'team-design',
      name: 'Design',
      color: '#EC4899',
      workspaceId: acmeCorp.id,
    },
  });
  console.log(`   ✓ Design (${designTeam.color})`);

  const viewersTeam = await prisma.team.upsert({
    where: { id: 'team-viewers' },
    update: {
      name: 'Viewers',
      color: '#6B7280',
    },
    create: {
      id: 'team-viewers',
      name: 'Viewers',
      color: '#6B7280',
      workspaceId: acmeCorp.id,
    },
  });
  console.log(`   ✓ Viewers (${viewersTeam.color})`);

  // ==========================================================================
  // Phase 5: Add Team Members
  // ==========================================================================
  console.log('\n👥 Adding team members...');

  // Engineering: Alice, Bob
  for (const member of [acmeMembers[alice.id], acmeMembers[bob.id]]) {
    await prisma.teamMember.upsert({
      where: {
        teamId_memberId: {
          teamId: engineeringTeam.id,
          memberId: member.id,
        },
      },
      update: {},
      create: {
        teamId: engineeringTeam.id,
        memberId: member.id,
      },
    });
  }
  console.log(`   ✓ Engineering: Alice, Bob`);

  // Design: Alice, Carol
  for (const member of [acmeMembers[alice.id], acmeMembers[carol.id]]) {
    await prisma.teamMember.upsert({
      where: {
        teamId_memberId: {
          teamId: designTeam.id,
          memberId: member.id,
        },
      },
      update: {},
      create: {
        teamId: designTeam.id,
        memberId: member.id,
      },
    });
  }
  console.log(`   ✓ Design: Alice, Carol`);

  // Viewers: Dave
  await prisma.teamMember.upsert({
    where: {
      teamId_memberId: {
        teamId: viewersTeam.id,
        memberId: acmeMembers[dave.id].id,
      },
    },
    update: {},
    create: {
      teamId: viewersTeam.id,
      memberId: acmeMembers[dave.id].id,
    },
  });
  console.log(`   ✓ Viewers: Dave`);

  // ==========================================================================
  // Phase 6: Create Collections
  // ==========================================================================
  console.log('\n📁 Creating collections...');

  const engineeringDocs = await prisma.collection.upsert({
    where: { id: 'col-engineering' },
    update: {
      name: 'Engineering Docs',
      icon: '🔧',
      isPrivate: false,
    },
    create: {
      id: 'col-engineering',
      name: 'Engineering Docs',
      icon: '🔧',
      isPrivate: false,
      userId: alice.id,
      workspaceId: acmeCorp.id,
    },
  });
  console.log(`   ✓ Engineering Docs 🔧`);

  const designAssets = await prisma.collection.upsert({
    where: { id: 'col-design' },
    update: {
      name: 'Design Assets',
      icon: '🎨',
      isPrivate: false,
    },
    create: {
      id: 'col-design',
      name: 'Design Assets',
      icon: '🎨',
      isPrivate: false,
      userId: alice.id,
      workspaceId: acmeCorp.id,
    },
  });
  console.log(`   ✓ Design Assets 🎨`);

  const publicDemos = await prisma.collection.upsert({
    where: { id: 'col-public' },
    update: {
      name: 'Public Demos',
      icon: '📢',
      isPrivate: false,
    },
    create: {
      id: 'col-public',
      name: 'Public Demos',
      icon: '📢',
      isPrivate: false,
      userId: alice.id,
      workspaceId: acmeCorp.id,
    },
  });
  console.log(`   ✓ Public Demos 📢`);

  const alicePrivate = await prisma.collection.upsert({
    where: { id: 'col-alice-private' },
    update: {
      name: "Alice's Private",
      icon: '🔒',
      isPrivate: true,
    },
    create: {
      id: 'col-alice-private',
      name: "Alice's Private",
      icon: '🔒',
      isPrivate: true,
      userId: alice.id,
      workspaceId: acmeCorp.id,
    },
  });
  console.log(`   ✓ Alice's Private 🔒`);

  // ==========================================================================
  // Phase 7: Configure Team Collection Access
  // ==========================================================================
  console.log('\n🔐 Configuring team collection access...');

  // Engineering Docs: Engineering=EDIT, Design=VIEW, Viewers=VIEW
  const teamCollectionAccess = [
    {
      team: engineeringTeam,
      collection: engineeringDocs,
      access: CollectionAccessLevel.EDIT,
    },
    {
      team: designTeam,
      collection: engineeringDocs,
      access: CollectionAccessLevel.VIEW,
    },
    {
      team: viewersTeam,
      collection: engineeringDocs,
      access: CollectionAccessLevel.VIEW,
    },
    // Design Assets: Engineering=VIEW, Design=EDIT, Viewers=VIEW
    {
      team: engineeringTeam,
      collection: designAssets,
      access: CollectionAccessLevel.VIEW,
    },
    {
      team: designTeam,
      collection: designAssets,
      access: CollectionAccessLevel.EDIT,
    },
    {
      team: viewersTeam,
      collection: designAssets,
      access: CollectionAccessLevel.VIEW,
    },
    // Public Demos: All teams VIEW
    {
      team: engineeringTeam,
      collection: publicDemos,
      access: CollectionAccessLevel.VIEW,
    },
    {
      team: designTeam,
      collection: publicDemos,
      access: CollectionAccessLevel.VIEW,
    },
    {
      team: viewersTeam,
      collection: publicDemos,
      access: CollectionAccessLevel.VIEW,
    },
  ];

  for (const { team, collection, access } of teamCollectionAccess) {
    await prisma.teamCollection.upsert({
      where: {
        teamId_collectionId: {
          teamId: team.id,
          collectionId: collection.id,
        },
      },
      update: { accessLevel: access },
      create: {
        teamId: team.id,
        collectionId: collection.id,
        accessLevel: access,
      },
    });
  }
  console.log(
    `   ✓ Engineering Docs: Engineering=EDIT, Design=VIEW, Viewers=VIEW`,
  );
  console.log(
    `   ✓ Design Assets: Engineering=VIEW, Design=EDIT, Viewers=VIEW`,
  );
  console.log(`   ✓ Public Demos: All teams=VIEW`);

  // ==========================================================================
  // Phase 8: Create Scenes
  // ==========================================================================
  console.log('\n🖼️  Creating scenes...');

  const scenes: Record<string, { id: string; title: string }> = {};

  const sceneData = [
    {
      id: 'scene-api-arch',
      title: 'API Architecture',
      userId: alice.id,
      collectionId: engineeringDocs.id,
    },
    {
      id: 'scene-db-schema',
      title: 'Database Schema',
      userId: bob.id,
      collectionId: engineeringDocs.id,
    },
    {
      id: 'scene-brand',
      title: 'Brand Guidelines',
      userId: alice.id,
      collectionId: designAssets.id,
    },
    {
      id: 'scene-logo',
      title: 'Logo Concepts',
      userId: carol.id,
      collectionId: designAssets.id,
    },
    {
      id: 'scene-demo',
      title: 'Product Demo',
      userId: alice.id,
      collectionId: publicDemos.id,
    },
    {
      id: 'scene-secret',
      title: 'Secret Project',
      userId: alice.id,
      collectionId: alicePrivate.id,
    },
  ];

  for (const scene of sceneData) {
    const storageKey = `scenes/${scene.id}/${nanoid()}.excalidraw`;
    const created = await prisma.scene.upsert({
      where: { id: scene.id },
      update: {
        title: scene.title,
        collectionId: scene.collectionId,
      },
      create: {
        id: scene.id,
        title: scene.title,
        storageKey,
        userId: scene.userId,
        collectionId: scene.collectionId,
        collaborationEnabled: true,
      },
    });
    scenes[scene.id] = created;
    console.log(`   ✓ ${scene.title}`);
  }

  // ==========================================================================
  // Phase 9: Create Sample Comments (for notification testing)
  // ==========================================================================
  console.log('\n💬 Creating sample comment threads...');

  // Thread 1: Alice mentions Bob on API Architecture
  const thread1 = await prisma.commentThread.upsert({
    where: { id: 'thread-1' },
    update: {},
    create: {
      id: 'thread-1',
      sceneId: scenes['scene-api-arch'].id,
      x: 100,
      y: 100,
      createdById: alice.id,
    },
  });

  await prisma.comment.upsert({
    where: { id: 'comment-1' },
    update: {},
    create: {
      id: 'comment-1',
      threadId: thread1.id,
      content: `@${bob.name} Please review this API design when you have a chance.`,
      mentions: [bob.id],
      createdById: alice.id,
    },
  });
  console.log(`   ✓ Thread 1: Alice mentions Bob on "API Architecture"`);

  // Thread 2: Bob replies and mentions Carol
  const thread2 = await prisma.commentThread.upsert({
    where: { id: 'thread-2' },
    update: {},
    create: {
      id: 'thread-2',
      sceneId: scenes['scene-api-arch'].id,
      x: 300,
      y: 200,
      createdById: bob.id,
    },
  });

  await prisma.comment.upsert({
    where: { id: 'comment-2' },
    update: {},
    create: {
      id: 'comment-2',
      threadId: thread2.id,
      content: `Looks good! @${carol.name} what do you think about the color scheme?`,
      mentions: [carol.id],
      createdById: bob.id,
    },
  });
  console.log(`   ✓ Thread 2: Bob mentions Carol on "API Architecture"`);

  // Thread 3: Alice mentions Carol on Brand Guidelines
  const thread3 = await prisma.commentThread.upsert({
    where: { id: 'thread-3' },
    update: {},
    create: {
      id: 'thread-3',
      sceneId: scenes['scene-brand'].id,
      x: 150,
      y: 150,
      createdById: alice.id,
    },
  });

  await prisma.comment.upsert({
    where: { id: 'comment-3' },
    update: {},
    create: {
      id: 'comment-3',
      threadId: thread3.id,
      content: `@${carol.name} Updated the brand colors based on your feedback.`,
      mentions: [carol.id],
      createdById: alice.id,
    },
  });
  console.log(`   ✓ Thread 3: Alice mentions Carol on "Brand Guidelines"`);

  // ==========================================================================
  // Phase 10: Create Notifications
  // ==========================================================================
  console.log('\n🔔 Creating notifications...');

  // Bob: 1 MENTION notification from Alice
  await prisma.notification.upsert({
    where: { id: 'notif-1' },
    update: {},
    create: {
      id: 'notif-1',
      type: NotificationType.MENTION,
      userId: bob.id,
      actorId: alice.id,
      sceneId: scenes['scene-api-arch'].id,
      threadId: thread1.id,
      commentId: 'comment-1',
      read: false,
    },
  });
  console.log(`   ✓ Bob: 1 unread MENTION notification`);

  // Carol: 2 MENTION notifications
  await prisma.notification.upsert({
    where: { id: 'notif-2' },
    update: {},
    create: {
      id: 'notif-2',
      type: NotificationType.MENTION,
      userId: carol.id,
      actorId: bob.id,
      sceneId: scenes['scene-api-arch'].id,
      threadId: thread2.id,
      commentId: 'comment-2',
      read: false,
    },
  });

  await prisma.notification.upsert({
    where: { id: 'notif-3' },
    update: {},
    create: {
      id: 'notif-3',
      type: NotificationType.MENTION,
      userId: carol.id,
      actorId: alice.id,
      sceneId: scenes['scene-brand'].id,
      threadId: thread3.id,
      commentId: 'comment-3',
      read: false,
    },
  });
  console.log(`   ✓ Carol: 2 unread MENTION notifications`);

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n' + '═'.repeat(60));
  console.log('✅ Seed complete!\n');

  console.log('📋 Test Users (password: Test123!)');
  console.log('─'.repeat(60));
  console.log('  alice@test.local  - Admin of Acme Corp');
  console.log('  bob@test.local    - Member, EDIT Engineering');
  console.log('  carol@test.local  - Member, EDIT Design');
  console.log('  dave@test.local   - Viewer (read-only)');
  console.log('  eve@test.local    - External (not in Acme Corp)');

  console.log('\n📊 Data Summary');
  console.log('─'.repeat(60));
  console.log(`  Users:        ${Object.keys(users).length}`);
  console.log(`  Workspaces:   3 (2 personal, 1 shared)`);
  console.log(`  Teams:        3 (Engineering, Design, Viewers)`);
  console.log(`  Collections:  4 (3 public, 1 private)`);
  console.log(`  Scenes:       ${Object.keys(scenes).length}`);
  console.log(`  Threads:      3`);
  console.log(`  Notifications: 3 (Bob=1, Carol=2)`);

  console.log('\n🧪 Test Scenarios');
  console.log('─'.repeat(60));
  console.log('  Login as Alice  → Full admin access to Acme Corp');
  console.log('  Login as Bob    → Can EDIT Engineering, VIEW Design');
  console.log('  Login as Carol  → Can VIEW Engineering, EDIT Design');
  console.log('  Login as Dave   → Read-only access everywhere');
  console.log('  Login as Eve    → Cannot see Acme Corp');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
