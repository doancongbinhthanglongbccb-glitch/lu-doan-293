/** @readonly */
export const USER_ROLES = {
    ADMIN: 'admin',
    USER: 'user'
};

/** @readonly */
export const USER_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected'
};

export const MILITARY_ID_LENGTH = 8;
export const MILITARY_ID_PATTERN = /^\d{8}$/;
export const MIN_PASSWORD_LENGTH = 6;

export const DEFAULT_ADMIN = {
    militaryId: '00000001',
    fullName: 'Administrator',
    role: USER_ROLES.ADMIN,
    status: USER_STATUS.APPROVED
};
