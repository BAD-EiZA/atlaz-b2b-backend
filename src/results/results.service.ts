import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ListResultsDto } from './dto/list-results.dto';

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  /* =====================
   * HELPER: IELTS overall
   * ===================== */
  private calculateIeltsOverall(scores: number[]): number {
    if (scores.length !== 4) {
      throw new Error(
        'IELTS overall score harus menggunakan 4 band scores (Listening, Reading, Writing, Speaking)',
      );
    }
    const avg = scores.reduce((a, b) => a + b, 0) / 4;
    // Pembulatan ke bawah ke .0 atau .5 terdekat
    const rounded = Math.floor(avg * 2) / 2;
    return rounded;
  }

  /* =====================
   * HELPER: TOEFL overall
   * ===================== */
  private calculateToeflOverall(
    listening: number,
    structure: number,
    reading: number,
  ): number {
    const raw = ((listening + structure + reading) / 3) * 10;
    return Math.round(raw);
  }

  /* ==========================================================
   * LIST IELTS RESULTS (untuk table utama ResultsPage)
   * ========================================================== */
  async listIelts(orgId: number, dto: any) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 10;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // ✅ org partner logo wajib
    const org = await this.prisma.b2b_orgs.findFirst({
      where: { id: orgId, deleted_at: null },
      select: { name: true, logo: true },
    });
    const orgName = org?.name ?? null;
    const orgLogo = org?.logo ?? null;

    if (!orgLogo) {
      throw new BadRequestException(
        'Org partner logo is required (b2b_orgs.logo).',
      );
    }

    const whereMember: any = {
      b2b_org_id: orgId,
      deleted_at: null,
      role: 'User',
    };

    if (dto.q) {
      whereMember.users = {
        OR: [{ name: { contains: dto.q } }, { email: { contains: dto.q } }],
      };
    }

    const [total, members] = await this.prisma.$transaction([
      this.prisma.b2b_org_members.count({ where: whereMember }),
      this.prisma.b2b_org_members.findMany({
        where: whereMember,
        include: {
          users: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);

    if (!members.length) {
      return { data: [], total, page, pageSize };
    }

    const userIds = members.map((m: any) => m.user_id);

    const tests = await this.prisma.ieltsUserTest.findMany({
      where: {
        userId: { in: userIds },
        isEnded: true,
        deletedAt: null,
      },
      distinct: ['token'],
      orderBy: { createdAt: 'desc' },
    });

    if (!tests.length) {
      const data = members.map((m: any) => ({
        id: m.users.id,
        studentName: m.users.name,
        email: m.users.email,
        overallBand: null,
        listeningBand: null,
        readingBand: null,
        writingBand: null,
        speakingBand: null,
        recentlyDone: null,
        createdAt: m.created_at,
        testDetails: [] as any[],
      }));
      return { data, total, page, pageSize };
    }

    const testIds = tests.map((t: any) => t.id);
    const tokens = tests.map((t: any) => t.token).filter((t: any) => !!t);

    const [certs, results, typeRows] = await this.prisma.$transaction([
      this.prisma.ieltsFullTestCertificate.findMany({
        where: { token: { in: tokens } },
      }),
      this.prisma.ieltsUserTestResult.findMany({
        where: {
          ieltsUserTestId: { in: testIds },
          deletedAt: null,
        },
      }),
      this.prisma.ielts_m_type.findMany({
        where: { deleted_at: null },
        select: { id: true, type: true },
      }),
    ]);

    const certByToken = new Map<string, any>();
    for (const c of certs) {
      if (c?.token) certByToken.set(c.token, c);
    }

    const resultByTestId = new Map<number, any>();
    for (const r of results) {
      resultByTestId.set(r.ieltsUserTestId, r);
    }

    const typeName: Record<number, string> = {};
    for (const t of typeRows) {
      typeName[t.id] = t.type ?? `Type ${t.id}`;
    }

    const buildIeltsCertificatePayload = (args: {
      participantName: string;
      registrationId: string;
      testDate: Date;

      countryOfOrigin?: string | null;
      nationality?: string | null;
      firstLanguage?: string | null;

      listeningScore: number | null;
      readingScore: number | null;
      writingScore: number | null;
      speakingScore: number | null;

      overallBand: number | null;
      cefrLevel: string | null;
      generalComment: string | null;

      orgName: string | null;
      orgLogo: string; // ✅ wajib
    }) => {
      // default angka ke 0 biar aman dipakai .toFixed(1) di PDF component
      return {
        participantName: args.participantName,
        registrationId: args.registrationId,
        testDate: args.testDate,

        countryOfOrigin: args.countryOfOrigin ?? '-',
        nationality: args.nationality ?? '-',
        firstLanguage: args.firstLanguage ?? '-',

        listeningScore: args.listeningScore ?? 0,
        readingScore: args.readingScore ?? 0,
        writingScore: args.writingScore ?? 0,
        speakingScore: args.speakingScore ?? 0,

        overallBand: args.overallBand ?? 0,
        cefrLevel: args.cefrLevel ?? '-',
        generalComment: args.generalComment ?? '-',

        orgs: args.orgName ? { name: args.orgName } : null,
        orgLogo: args.orgLogo, // ✅ wajib
      };
    };

    const data = members.map((member: any) => {
      const userId = member.user_id;

      const userTests = tests
        .filter((t: any) => t.userId === userId)
        .sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

      const latestBands = {
        listening: null as number | null,
        reading: null as number | null,
        writing: null as number | null,
        speaking: null as number | null,
      };

      const testDetails: any[] = [];

      for (const t of userTests) {
        const label = typeName[t.type] || `Type ${t.type}`;
        const lowerLabel = (label || '').toLowerCase();
        const isComplete = lowerLabel.includes('complete');

        const cert = t.token ? certByToken.get(t.token) : null;
        const res = resultByTestId.get(t.id);

        const resOverall =
          res?.overall != null && res.overall !== ''
            ? Number(res.overall)
            : null;

        let listening: number | null = null;
        let reading: number | null = null;
        let writing: number | null = null;
        let speaking: number | null = null;
        let overall: number | null = null;

        let registrationIdForCert = t.token ?? String(t.id);
        let testDateForCert = new Date(t.createdAt);
        let generalCommentForCert: string | null = '-';
        let cefrLevelForCert: string | null = '-';

        if (isComplete && cert) {
          // ✅ schema IeltsFullTestCertificate (snake_case)
          listening = Number(cert.listening_score);
          reading = Number(cert.reading_score);
          writing = Number(cert.writing_score);
          speaking = Number(cert.speaking_score);
          overall = Number(cert.overall_band);

          registrationIdForCert = cert.registration_id ?? registrationIdForCert;
          testDateForCert = cert.test_date
            ? new Date(cert.test_date)
            : testDateForCert;

          generalCommentForCert = cert.general_comment ?? '-';
          cefrLevelForCert = cert.cefr_level ?? '-';
        } else if (resOverall != null && !Number.isNaN(resOverall)) {
          // section test
          if (lowerLabel.includes('listen')) listening = resOverall;
          else if (lowerLabel.includes('read')) reading = resOverall;
          else if (lowerLabel.includes('writ')) writing = resOverall;
          else if (lowerLabel.includes('speak')) speaking = resOverall;

          overall = resOverall;

          // kalau kamu punya comment di result table, bisa dipakai:
          // generalCommentForCert = res?.comment ?? "-";
          // cefrLevelForCert = res?.cefrLevel ?? "-";
        }

        // simpan latest bands
        if (listening != null && latestBands.listening == null)
          latestBands.listening = listening;
        if (reading != null && latestBands.reading == null)
          latestBands.reading = reading;
        if (writing != null && latestBands.writing == null)
          latestBands.writing = writing;
        if (speaking != null && latestBands.speaking == null)
          latestBands.speaking = speaking;

        // detail max 5
        if (testDetails.length < 5) {
          const certificatePayload = buildIeltsCertificatePayload({
            participantName: member.users.name,
            registrationId: registrationIdForCert,
            testDate: testDateForCert,

            listeningScore: listening,
            readingScore: reading,
            writingScore: writing,
            speakingScore: speaking,

            overallBand: overall,
            cefrLevel: cefrLevelForCert,
            generalComment: generalCommentForCert,

            orgName,
            orgLogo, // ✅ wajib
          });

          testDetails.push({
            testId: t.id,
            token: t.token ?? null,
            isComplete,
            type: label,
            date: t.createdAt,

            listening,
            reading,
            writing,
            speaking,
            overall,

            certificatePayload,
          });
        }
      }

      // ringkasan overall band jika 4 skill lengkap
      let overallBand: number | null = null;
      const bands = [
        latestBands.listening,
        latestBands.reading,
        latestBands.writing,
        latestBands.speaking,
      ];
      if (bands.every((b) => typeof b === 'number')) {
        overallBand = this.calculateIeltsOverall(bands as number[]);
      }

      const recentlyDone = userTests.length ? userTests[0].createdAt : null;

      return {
        id: member.users.id,
        studentName: member.users.name,
        email: member.users.email,

        overallBand,
        listeningBand: latestBands.listening,
        readingBand: latestBands.reading,
        writingBand: latestBands.writing,
        speakingBand: latestBands.speaking,

        recentlyDone,
        createdAt: member.created_at,

        testDetails,
      };
    });

    return { data, total, page, pageSize };
  }

  /* ==========================================================
   * LIST TOEFL RESULTS
   * ========================================================== */
  async listToefl(orgId: number, dto: any) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 10;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // ✅ org partner logo wajib
    const org = await this.prisma.b2b_orgs.findFirst({
      where: { id: orgId, deleted_at: null },
      select: { name: true, logo: true },
    });
    const orgName = org?.name ?? null;
    const orgLogo = org?.logo ?? null;

    if (!orgLogo) {
      throw new BadRequestException(
        'Org partner logo is required (b2b_orgs.logo).',
      );
    }

    const whereMember: any = {
      b2b_org_id: orgId,
      deleted_at: null,
      role: 'User',
    };

    if (dto.q) {
      whereMember.users = {
        OR: [{ name: { contains: dto.q } }, { email: { contains: dto.q } }],
      };
    }

    const [total, members] = await this.prisma.$transaction([
      this.prisma.b2b_org_members.count({ where: whereMember }),
      this.prisma.b2b_org_members.findMany({
        where: whereMember,
        include: {
          users: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);

    if (!members.length) {
      return { data: [], total, page, pageSize };
    }

    const userIds = members.map((m: any) => m.user_id);

    const tests = await this.prisma.toeflUserTest.findMany({
      where: {
        userId: { in: userIds },
        isEnded: true,
        deletedAt: null,
      },
      distinct: ['token'],
      orderBy: { createdAt: 'desc' },
    });

    if (!tests.length) {
      const data = members.map((m: any) => ({
        id: m.users.id,
        studentName: m.users.name,
        email: m.users.email,
        overallScore: null,
        listeningScore: null,
        structureScore: null,
        readingScore: null,
        recentlyDone: null,
        createdAt: m.created_at,
        testDetails: [] as any[],
      }));
      return { data, total, page, pageSize };
    }

    const testIds = tests.map((t: any) => t.id);
    const tokens = tests.map((t: any) => t.token).filter((t: any) => !!t);

    const [certs, results, typeRows] = await this.prisma.$transaction([
      this.prisma.toeflFullTestCertificate.findMany({
        where: { token: { in: tokens } },
      }),
      this.prisma.toeflUserTestResult.findMany({
        where: {
          toeflUserTestId: { in: testIds },
          deletedAt: null,
        },
      }),
      this.prisma.toefl_m_type.findMany({
        where: { deleted_at: null },
        select: { id: true, type: true },
      }),
    ]);

    const certByToken = new Map<string, any>();
    for (const c of certs) {
      if (c?.token) certByToken.set(c.token, c);
    }

    const resultByTestId = new Map<number, any>();
    for (const r of results) {
      resultByTestId.set(r.toeflUserTestId, r);
    }

    const typeName: Record<number, string> = {};
    for (const t of typeRows) {
      typeName[t.id] = t.type ?? `Type ${t.id}`;
    }

    const buildToeflCertificatePayload = (args: {
      studentName: string;
      registrationId: string;
      testDate: Date;

      totalScore: number | null;
      totalComment: string | null;

      listeningScore: number | null;
      structureScore: number | null;
      readingScore: number | null;

      cefrLevel: string | null;

      orgLogo: string; // ✅ wajib
      orgName: string | null;
    }) => {
      const fallbackComment = args.totalComment ?? '-';

      return {
        studentName: args.studentName,
        registrationId: args.registrationId,
        testDate: new Date(args.testDate).toLocaleDateString('id-ID'),

        totalScore: args.totalScore ?? 0,
        totalComment: args.totalComment ?? '-',

        listening: {
          title: 'Listening',
          cefrLevel: args.cefrLevel ?? '-',
          scaledScore: args.listeningScore ?? 0,
          comment: fallbackComment,
        },
        structure: {
          title: 'Structure',
          cefrLevel: args.cefrLevel ?? '-',
          scaledScore: args.structureScore ?? 0,
          comment: fallbackComment,
        },
        reading: {
          title: 'Reading',
          cefrLevel: args.cefrLevel ?? '-',
          scaledScore: args.readingScore ?? 0,
          comment: fallbackComment,
        },

        orgs: args.orgName ? { name: args.orgName } : null,
        orgLogo: args.orgLogo, // ✅ wajib
      };
    };

    const data = members.map((member: any) => {
      const userId = member.user_id;

      const userTests = tests
        .filter((t: any) => t.userId === userId)
        .sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

      const latest = {
        listening: null as number | null,
        structure: null as number | null,
        reading: null as number | null,
      };

      const testDetails: any[] = [];

      for (const t of userTests) {
        const label = typeName[t.type] || `Type ${t.type}`;
        const lowerLabel = (label || '').toLowerCase();
        const isComplete = lowerLabel.includes('complete');

        const cert = t.token ? certByToken.get(t.token) : null;
        const res = resultByTestId.get(t.id);

        let listening: number | null = null;
        let structure: number | null = null;
        let reading: number | null = null;
        let overall: number | null = null;

        let registrationIdForCert = t.token ?? String(t.id);
        let testDateForCert = new Date(t.createdAt);
        let generalCommentForCert: string | null = '-';
        let cefrLevelForCert: string | null = '-';

        if (isComplete && cert) {
          // ✅ schema ToeflFullTestCertificate (camelCase)
          listening = Number(cert.listeningScore);
          structure = Number(cert.structureScore);
          reading = Number(cert.readingScore);
          overall = Number(cert.overall);

          registrationIdForCert = cert.registrationId ?? registrationIdForCert;
          testDateForCert = cert.testDate
            ? new Date(cert.testDate)
            : testDateForCert;

          generalCommentForCert = cert.generalComment ?? '-';
          cefrLevelForCert = cert.cefrLevel ?? '-';
        } else if (res) {
          const vRaw = res.overall != null ? Number(res.overall) : null;
          const v = vRaw != null && !Number.isNaN(vRaw) ? vRaw : null;

          overall = v;

          if (v != null) {
            if (lowerLabel.includes('listening')) listening = v;
            if (
              lowerLabel.includes('structure') ||
              lowerLabel.includes('grammar')
            )
              structure = v;
            if (lowerLabel.includes('reading')) reading = v;
          }

          // kalau ada comment di result table:
          // generalCommentForCert = res?.comment ?? "-";
        }

        if (listening != null && latest.listening == null)
          latest.listening = listening;
        if (structure != null && latest.structure == null)
          latest.structure = structure;
        if (reading != null && latest.reading == null) latest.reading = reading;

        if (testDetails.length < 5) {
          const certificatePayload = buildToeflCertificatePayload({
            studentName: member.users.name,
            registrationId: registrationIdForCert,
            testDate: testDateForCert,

            totalScore: overall,
            totalComment: generalCommentForCert,

            listeningScore: listening,
            structureScore: structure,
            readingScore: reading,

            cefrLevel: cefrLevelForCert,

            orgLogo, // ✅ wajib
            orgName,
          });

          testDetails.push({
            testId: t.id,
            token: t.token ?? null,
            isComplete,
            type: label,
            date: t.createdAt,

            listening,
            structure,
            reading,
            overall,

            certificatePayload,
          });
        }
      }

      let overallScore: number | null = null;
      if (
        typeof latest.listening === 'number' &&
        typeof latest.structure === 'number' &&
        typeof latest.reading === 'number'
      ) {
        overallScore = this.calculateToeflOverall(
          latest.listening,
          latest.structure,
          latest.reading,
        );
      }

      const recentlyDone = userTests.length ? userTests[0].createdAt : null;

      return {
        id: member.users.id,
        studentName: member.users.name,
        email: member.users.email,

        overallScore,
        listeningScore: latest.listening,
        structureScore: latest.structure,
        readingScore: latest.reading,

        recentlyDone,
        createdAt: member.created_at,

        testDetails,
      };
    });

    return { data, total, page, pageSize };
  }

  /* ==========================================================
   * HISTORY IELTS – semua record, dipisah per tipe
   * ========================================================== */
  async historyIelts(orgId: number, userId: number) {
    const member = await this.prisma.b2b_org_members.findFirst({
      where: {
        b2b_org_id: orgId,
        user_id: userId,
        deleted_at: null,
      },
      include: {
        users: { select: { id: true, name: true, email: true } },
      },
    });

    if (!member) {
      throw new NotFoundException({
        code: 'MEMBER_NOT_FOUND',
        message: 'User bukan member org ini',
      });
    }

    const tests = await this.prisma.ieltsUserTest.findMany({
      where: {
        userId,
        isEnded: true,
        deletedAt: null,
      },
      distinct: ['token'],
      orderBy: { createdAt: 'desc' },
    });

    if (!tests.length) {
      return {
        exam: 'ielts',
        student: member.users,
        groups: {},
      };
    }

    const testIds = tests.map((t) => t.id);
    const tokens = tests.map((t) => t.token).filter((t): t is string => !!t);

    const [certs, results, typeRows] = await this.prisma.$transaction([
      this.prisma.ieltsFullTestCertificate.findMany({
        where: { token: { in: tokens } },
      }),
      this.prisma.ieltsUserTestResult.findMany({
        where: {
          ieltsUserTestId: { in: testIds },
          deletedAt: null,
        },
      }),
      this.prisma.ielts_m_type.findMany({
        where: { deleted_at: null },
        select: { id: true, type: true },
      }),
    ]);

    const certByToken = new Map<string, any>();
    for (const c of certs) {
      certByToken.set(c.token, c);
    }

    const resultByTestId = new Map<number, any>();
    for (const r of results) {
      resultByTestId.set(r.ieltsUserTestId, r);
    }

    const typeName: Record<number, string> = {};
    for (const t of typeRows) {
      typeName[t.id] = t.type ?? `Type ${t.id}`;
    }

    const groups: Record<
      string,
      {
        testId: number;
        date: Date;
        type: string;
        listening: number | null;
        reading: number | null;
        writing: number | null;
        speaking: number | null;
        overall: number | null;
      }[]
    > = {};

    for (const t of tests) {
      const label = typeName[t.type] || `Type ${t.type}`;
      const lowerLabel = (label || '').toLowerCase();
      const isComplete = lowerLabel.includes('complete');

      const cert = t.token ? certByToken.get(t.token) : null;
      const res = resultByTestId.get(t.id);
      const resOverall =
        res?.overall != null && res.overall !== '' ? Number(res.overall) : null;

      let listening: number | null = null;
      let reading: number | null = null;
      let writing: number | null = null;
      let speaking: number | null = null;
      let overall: number | null = null;

      if (isComplete && cert) {
        listening = Number(cert.listening_score ?? null);
        reading = Number(cert.reading_score ?? null);
        writing = Number(cert.writing_score ?? null);
        speaking = Number(cert.speaking_score ?? null);
        overall = Number(cert.overall_band ?? null);
      } else if (resOverall != null) {
        if (lowerLabel.includes('listen')) {
          listening = resOverall;
        } else if (lowerLabel.includes('read')) {
          reading = resOverall;
        } else if (lowerLabel.includes('writ')) {
          writing = resOverall;
        } else if (lowerLabel.includes('speak')) {
          speaking = resOverall;
        }
        overall = resOverall;
      }

      if (!groups[label]) groups[label] = [];
      groups[label].push({
        testId: t.id,
        date: t.createdAt,
        type: label,
        listening,
        reading,
        writing,
        speaking,
        overall,
      });
    }

    return {
      exam: 'ielts',
      student: member.users,
      groups,
    };
  }

  /* ==========================================================
   * HISTORY TOEFL – semua record, dipisah per tipe
   * ========================================================== */
  async historyToefl(orgId: number, userId: number) {
    const member = await this.prisma.b2b_org_members.findFirst({
      where: {
        b2b_org_id: orgId,
        user_id: userId,
        deleted_at: null,
      },
      include: {
        users: { select: { id: true, name: true, email: true } },
      },
    });

    if (!member) {
      throw new NotFoundException({
        code: 'MEMBER_NOT_FOUND',
        message: 'User bukan member org ini',
      });
    }

    const tests = await this.prisma.toeflUserTest.findMany({
      where: {
        userId,
        isEnded: true,
        deletedAt: null,
      },
      distinct: ['token'],
      orderBy: { createdAt: 'desc' },
    });

    if (!tests.length) {
      return {
        exam: 'toefl',
        student: member.users,
        groups: {},
      };
    }

    const testIds = tests.map((t) => t.id);
    const tokens = tests.map((t) => t.token).filter((t): t is string => !!t);

    const [certs, results, typeRows] = await this.prisma.$transaction([
      this.prisma.toeflFullTestCertificate.findMany({
        where: { token: { in: tokens } },
      }),
      this.prisma.toeflUserTestResult.findMany({
        where: {
          toeflUserTestId: { in: testIds },
          deletedAt: null,
        },
      }),
      this.prisma.toefl_m_type.findMany({
        where: { deleted_at: null },
        select: { id: true, type: true },
      }),
    ]);

    const certByToken = new Map<string, any>();
    for (const c of certs) {
      certByToken.set(c.token, c);
    }

    const resultByTestId = new Map<number, any>();
    for (const r of results) {
      resultByTestId.set(r.toeflUserTestId, r);
    }

    const typeName: Record<number, string> = {};
    for (const t of typeRows) {
      typeName[t.id] = t.type ?? `Type ${t.id}`;
    }

    const groups: Record<
      string,
      {
        testId: number;
        date: Date;
        type: string;
        listening: number | null;
        structure: number | null;
        reading: number | null;
        overall: number | null;
      }[]
    > = {};

    for (const t of tests) {
      const label = typeName[t.type] || `Type ${t.type}`;
      const lowerLabel = (label || '').toLowerCase();
      const isComplete = lowerLabel.includes('complete');

      const cert = t.token ? certByToken.get(t.token) : null;
      const res = resultByTestId.get(t.id);

      let listening: number | null = null;
      let structure: number | null = null;
      let reading: number | null = null;
      let overall: number | null = null;

      if (isComplete && cert) {
        listening = Number(cert.listeningScore ?? null);
        structure = Number(cert.structureScore ?? null);
        reading = Number(cert.readingScore ?? null);
        overall = Number(cert.overall ?? null);
      } else if (res) {
        overall = Number(res.overall ?? null);

        // Mapping overall ke section sesuai tipe
        const sectionScore =
          overall != null && !Number.isNaN(overall) ? overall : null;

        if (sectionScore != null) {
          // contoh label:
          // "Listening Only", "Paket Listening", "Structure & Written Expression",
          // "Reading Test", dll.

          if (lowerLabel.includes('listening')) {
            listening = sectionScore;
          }

          if (
            lowerLabel.includes('structure') ||
            lowerLabel.includes('grammar')
          ) {
            structure = sectionScore;
          }

          if (lowerLabel.includes('reading')) {
            reading = sectionScore;
          }

          // kalau nanti ada paket kombinasi (misalnya "Listening & Reading"),
          // kondisi di atas akan mengisi dua kolom sekaligus karena kedua kata
          // ada di label.
        }
      }

      if (!groups[label]) groups[label] = [];
      groups[label].push({
        testId: t.id,
        date: t.createdAt,
        type: label,
        listening,
        structure,
        reading,
        overall,
      });
    }

    return {
      exam: 'toefl',
      student: member.users,
      groups,
    };
  }
}
