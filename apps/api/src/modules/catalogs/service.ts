import type { PoolClient } from 'pg';
import type { AcademicLevelDto, AcademicYearDto, CohortDto, DepartmentDto, GroupDto } from '@dentpilot/contracts';
import type { Principal } from '../../security/auth.js';
import { AuthorizationService } from '../../security/authorization.js';

const iso = (value: Date|string): string => value instanceof Date ? value.toISOString() : String(value);

export class CatalogsService {
  constructor(private readonly authorization: AuthorizationService) {}

  async departments(client: PoolClient, principal: Principal): Promise<DepartmentDto[]> {
    await this.authorization.assert(client, principal, 'catalogs:read');
    const result = await client.query<{id:string;college_id:string;code:string;name:string;active:boolean;revision:number}>(
      `SELECT DISTINCT d.id,d.college_id,d.code,d.name,d.active,d.revision
       FROM departments d
       LEFT JOIN account_scopes ac ON ac.department_id=d.id AND ac.account_id=$1
       WHERE $2::boolean OR ac.id IS NOT NULL
       ORDER BY d.name,d.id`,
      [principal.accountId, principal.role === 'UNIVERSITY_ADMIN'],
    );
    return result.rows.map((row) => ({id:row.id,collegeId:row.college_id,code:row.code,name:row.name,active:row.active,revision:row.revision}));
  }

  async academicYears(client: PoolClient, principal: Principal): Promise<AcademicYearDto[]> {
    await this.authorization.assert(client, principal, 'catalogs:read');
    const result = await client.query<{id:string;label:string;starts_on:Date|string;ends_on:Date|string;status:AcademicYearDto['status'];revision:number}>(
      'SELECT id,label,starts_on,ends_on,status,revision FROM academic_years ORDER BY starts_on DESC,id',
    );
    return result.rows.map((row) => ({id:row.id,label:row.label,startsOn:iso(row.starts_on),endsOn:iso(row.ends_on),status:row.status,revision:row.revision}));
  }

  async academicLevels(client: PoolClient, principal: Principal): Promise<AcademicLevelDto[]> {
    await this.authorization.assert(client, principal, 'catalogs:read');
    const result = await client.query<{id:string;code:string;label:string;ordinal:number;active:boolean}>(
      'SELECT id,code,label,ordinal,active FROM academic_levels ORDER BY ordinal,id',
    );
    return result.rows.map((row) => ({id:row.id,code:row.code,label:row.label,ordinal:row.ordinal,active:row.active}));
  }

  async cohorts(client: PoolClient, principal: Principal): Promise<CohortDto[]> {
    await this.authorization.assert(client, principal, 'catalogs:read');
    const result=await client.query<{id:string;label:string;active:boolean}>('SELECT id,label,active FROM cohorts ORDER BY label,id');
    return result.rows.map((row)=>({id:row.id,label:row.label,active:row.active}));
  }

  async groups(client: PoolClient, principal: Principal, filters: {departmentId?:string;academicYearId?:string;academicLevelId?:string}): Promise<GroupDto[]> {
    await this.authorization.assert(client, principal, 'groups:read', filters);
    const result = await client.query<{id:string;department_id:string;academic_year_id:string;academic_level_id:string;name:string;range_start:number|null;range_end:number|null;status:GroupDto['status'];revision:number}>(
      `SELECT DISTINCT g.id,g.department_id,g.academic_year_id,g.academic_level_id,g.name,g.range_start,g.range_end,g.status,g.revision
       FROM academic_groups g
       LEFT JOIN account_scopes ac ON ac.account_id=$1 AND ac.department_id=g.department_id
         AND (ac.academic_year_id IS NULL OR ac.academic_year_id=g.academic_year_id)
         AND (ac.academic_level_id IS NULL OR ac.academic_level_id=g.academic_level_id)
       WHERE ($2::boolean OR ac.id IS NOT NULL)
         AND ($3::uuid IS NULL OR g.department_id=$3)
         AND ($4::uuid IS NULL OR g.academic_year_id=$4)
         AND ($5::uuid IS NULL OR g.academic_level_id=$5)
       ORDER BY g.name,g.id`,
      [principal.accountId,principal.role==='UNIVERSITY_ADMIN',filters.departmentId??null,filters.academicYearId??null,filters.academicLevelId??null],
    );
    return result.rows.map((row) => ({id:row.id,departmentId:row.department_id,academicYearId:row.academic_year_id,academicLevelId:row.academic_level_id,name:row.name,rangeStart:row.range_start,rangeEnd:row.range_end,status:row.status,revision:row.revision}));
  }
}
