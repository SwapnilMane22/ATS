export type CoreRoleId = "SoftwareEngineer_Backend" | "SoftwareEngineer_Frontend" | "SoftwareEngineer_Fullstack" | "DataEngineer" | "DataAnalyst" | "ML_Engineer" | "DevOps_SRE" | "CloudEngineer" | "SecurityEngineer" | "ProductManager_Technical";
export type CoreCompetencyId = "SystemDesign" | "APIs" | "Databases" | "DistributedSystems" | "Reliability" | "Observability" | "Performance" | "TestingQuality" | "SecurityPrivacy" | "Ownership" | "Leadership" | "StakeholderCommunication";
export interface RoleDefinition {
    roleId: CoreRoleId;
    label: string;
    description: string;
}
export interface CompetencyDefinition {
    competencyId: CoreCompetencyId;
    label: string;
    description: string;
    weight: number;
}
export declare const ROLE_TAXONOMY: RoleDefinition[];
export declare const COMPETENCY_TAXONOMY: CompetencyDefinition[];
//# sourceMappingURL=taxonomy.d.ts.map