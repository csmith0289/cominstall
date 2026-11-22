# Com-Install Job Cards

A mobile web app for Com-Install Ltd, a commercial vehicle services business. Engineers record the work they do on vehicles as Job Cards; Admins track every Job Card through to Complete.

## Language

### People

**Engineer**:
A Com-Install staff member who does jobs on vehicles and fills in Job Cards. Sees and edits only their own Job Cards.
_Avoid_: user, fitter, technician, mechanic

**Admin**:
A Com-Install staff member who manages the business side: sees every Job Card, invites and manages Users, reopens and reassigns Job Cards. Luke Smith (Founder) is the first Admin.
_Avoid_: manager, owner, superuser

**User**:
Anyone with an account in the app: an Engineer or an Admin. Each User has exactly one Role.
_Avoid_: member, staff account

**Role**:
`engineer` or `admin`, stored on the User. Decides what they can see and do.
_Avoid_: permission, level

**Operator**:
The app's developer, who supports Com-Install under an NDA. Set only by `OPERATOR_EMAILS`, never from inside the app. Can see everything and fix support problems; every change they make is in the Audit Log. Not a User Role.
_Avoid_: super admin, developer account, support user

**Invitation**:
An Admin's offer of an account to an email address, with the Role it will have. Only an invited email (or one in `ADMIN_EMAILS`) can sign up.
_Avoid_: invite code, sign-up link

### Jobs

**Job Card**:
The record of one job on one Vehicle on one day: date, Vehicle, Customer, mileage, Work Carried Out and Parts Used. Belongs to one Engineer. Replaces the paper Com-Install job card.
_Avoid_: job sheet, ticket, work order, job

**Status**:
Where a Job Card is: **Draft** (being filled in), **Outstanding** (submitted, work not finished or not signed off) or **Complete** (finished; the PDF can be sent). Only these three.
_Avoid_: state, stage

**Work Carried Out**:
The free-text description of what was done on the job, as on the paper card's lined box.
_Avoid_: notes, description, comments

**Part Used**:
One line of the Job Card's parts table: quantity, part or item, and part number or notes.
_Avoid_: line item, material

**Job Card PDF**:
The Job Card laid out like the paper card (logo, REG / DATE / CUSTOMER / MILEAGE grid, lined Work Carried Out, QTY / PART / PART NO. table), sent from the phone's share menu.
_Avoid_: report, printout

### Vehicles and customers

**Vehicle**:
A vehicle Com-Install works on, identified by its Reg. Has a Customer and optional make, model and VIN.
_Avoid_: van, car, unit, asset

**Reg**:
A Vehicle's registration mark. Stored in capitals with no spaces (`AB12CDE`), shown with the usual space (`AB12 CDE`). Unique across Vehicles.
_Avoid_: registration number, plate, VRM

**Vehicle History**:
Every Job Card for a Vehicle, newest first, and every Part Used on it, found by Reg. Engineers see only their own Job Cards in it.
_Avoid_: service history, timeline

**Customer**:
The business or person a Vehicle belongs to, usually a fleet. Has a name and contact details.
_Avoid_: client, account, fleet

### Record keeping

**Audit Log**:
An append-only record of who changed a Job Card's Status, reassigned it, or changed a User, and when. Includes every Operator change.
_Avoid_: history, activity feed
