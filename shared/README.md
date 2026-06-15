# Shared code (FE + BE)

Constants và types dùng chung giữa `frontend/` và `backend/`.

## Hiện tại

| Module | Nội dung |
|--------|----------|
| `constants/user.js` | `USER_STATUS`, `USER_ROLES`, `MILITARY_ID_PATTERN`, `DEFAULT_ADMIN` |

## Cách dùng

**Backend:**
```javascript
import { USER_STATUS } from '../../../shared/constants/user.js';
```

**Frontend** (qua Express `/shared`):
```javascript
export { USER_STATUS } from '/shared/constants/user.js';
```

`frontend/js/config/constants.js` re-export user/auth constants từ shared.

## Roadmap

- [x] Frontend constants re-export từ shared
- [ ] Thêm `types/` (JSDoc hoặc TypeScript)
