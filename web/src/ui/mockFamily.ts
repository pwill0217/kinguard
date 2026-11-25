// Fictional family used ONLY in mock builds (VITE_MOCK_ENGINE=1) for UI screenshots and tests.
import type { Me } from '../family/account';
import type { Circle, FamilyAlert, Invite, Member } from '../family/circles';

const ago = (min: number) => new Date(Date.now() - min * 60_000);

const me: Me = { uid: 'u-will', name: 'Will Parker', firstName: 'Will', photoURL: null, email: 'will@example.com' };

export const mockFamily: { me: Me; circles: Circle[]; members: Member[]; alerts: FamilyAlert[]; invites: Invite[] } = {
  me,
  circles: [{ id: 'c1', name: 'The Parker Family', ownerUid: 'u-will', memberUids: ['u-will', 'u-margaret', 'u-george', 'u-dana'] }],
  members: [
    { uid: 'u-will', name: 'Will Parker', photoURL: null, role: 'owner', protected: false, joinedAt: ago(9000), lastCheck: null },
    { uid: 'u-dana', name: 'Dana Parker', photoURL: null, role: 'admin', protected: false, joinedAt: ago(8000), lastCheck: null },
    { uid: 'u-margaret', name: 'Margaret Parker', photoURL: null, role: 'member', protected: true, joinedAt: ago(7000), lastCheck: { at: ago(12), verdict: 'likely_scam' } },
    { uid: 'u-george', name: 'George Parker', photoURL: null, role: 'member', protected: true, joinedAt: ago(7000), lastCheck: { at: ago(180), verdict: 'safe' } },
  ],
  alerts: [
    {
      id: 'a1',
      fromUid: 'u-margaret',
      fromName: 'Margaret',
      verdict: 'likely_scam',
      riskScore: 96,
      category: 'family_emergency',
      headline: 'Fake grandchild emergency',
      explanation: 'Someone pretending to be a grandchild asked for bail money in gift cards. Do not call [PHONE_1].',
      createdAt: ago(12),
      ackBy: [],
      ackNames: [],
    },
    {
      id: 'a2',
      fromUid: 'u-george',
      fromName: 'George',
      verdict: 'suspicious',
      riskScore: 58,
      category: 'delivery',
      headline: 'Suspicious delivery text',
      explanation: 'A text asked to pay a small redelivery fee through an unofficial link.',
      createdAt: ago(60 * 26),
      ackBy: ['u-dana'],
      ackNames: ['Dana'],
    },
  ],
  invites: [
    { code: 'K7MQ2X', circleId: 'c1', circleName: 'The Parker Family', createdBy: 'u-will', createdByName: 'Will', asProtected: false, expiresAt: new Date(Date.now() + 40 * 3600_000), revoked: false },
  ],
};
