const fs = require('fs');
const path = require('path');

// 1. Update src/components/layout/app-sidebar.tsx
const sidebarFile = path.join(__dirname, '../src/components/layout/app-sidebar.tsx');
let sidebarCode = fs.readFileSync(sidebarFile, 'utf-8');
sidebarCode = sidebarCode.replace(
  `  } else if (isReviewer) {
    adminItems.push({ href: '/admin/approvals', label: 'Approvals', icon: ShieldCheck });
    adminItems.push({ href: '/admin/audit-logs', label: 'Audit Trail & PDF', icon: ShieldCheck });
    adminItems.push({ href: '/reports', label: 'Financial Reports', icon: FileText });
  }`,
  `  } else if (isReviewer) {
    adminItems.push({ href: '/admin/approvals', label: 'Approvals', icon: ShieldCheck });
    adminItems.push({ href: '/members', label: 'Members Directory', icon: Users });
    adminItems.push({ href: '/admin/audit-logs', label: 'Audit Trail & PDF', icon: ShieldCheck });
    adminItems.push({ href: '/reports', label: 'Financial Reports', icon: FileText });
  }`
);
fs.writeFileSync(sidebarFile, sidebarCode);

// 2. Update src/app/admin/layout.tsx
const adminLayoutFile = path.join(__dirname, '../src/app/admin/layout.tsx');
let adminLayoutCode = fs.readFileSync(adminLayoutFile, 'utf-8');
adminLayoutCode = adminLayoutCode.replace(
  `      ...(isSuperAdmin ? [
        { href: '/members', label: 'Members Directory', icon: Users },
        { href: '/reports', label: 'Financial Reports', icon: FileText },
        { href: '/admin/settings', label: 'Settings', icon: Settings },
      ] : [
        { href: '/reports', label: 'Financial Reports', icon: FileText },
      ])`,
  `      ...(isSuperAdmin || isReviewer ? [
        { href: '/members', label: 'Members Directory', icon: Users },
      ] : []),
      ...(isSuperAdmin ? [
        { href: '/reports', label: 'Financial Reports', icon: FileText },
        { href: '/admin/settings', label: 'Settings', icon: Settings },
      ] : [
        { href: '/reports', label: 'Financial Reports', icon: FileText },
      ])`
);
fs.writeFileSync(adminLayoutFile, adminLayoutCode);

// 3. Update src/app/(app)/more/page.tsx
const moreFile = path.join(__dirname, '../src/app/(app)/more/page.tsx');
let moreCode = fs.readFileSync(moreFile, 'utf-8');
moreCode = moreCode.replace(
  `        ...(isAdmin ? [
          { href: '/members', label: 'Member Directory', icon: Users, description: 'Manage system access' },
          { href: '/admin/settings', label: 'System Settings', icon: Settings, description: 'Global financial policies' }
        ] : []),`,
  `        ...(isAdmin || role === 'reviewer' ? [
          { href: '/members', label: 'Member Directory', icon: Users, description: 'Manage system access' },
        ] : []),
        ...(isAdmin ? [
          { href: '/admin/settings', label: 'System Settings', icon: Settings, description: 'Global financial policies' }
        ] : []),`
);
fs.writeFileSync(moreFile, moreCode);

console.log('Fixed reviewer access to /members link!');
