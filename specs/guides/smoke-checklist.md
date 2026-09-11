# Manual smoke checklist (operator)

Twelve steps to test the `n8n-nodes-brault` package against `stg` before a release or a
promotion. Run it with `npm run dev` (starts a local n8n instance with the package
loaded) against:

- **Base URL:** `https://api.stg.brault.app`
- **API Key:** the one the team gave you for `stg`. Do not write it into this file, nor
  into a node of the workflow you are going to export, nor into a commit — it only goes
  in the **API Key** field of the `Brault API` credential inside n8n.

Check each box as you go. If something does not match what "What should happen" says,
stop there and report it before moving to the next step.

There is also a headless alternative that runs 47 automated checks against staging:
`source ~/.config/brault/n8n-stg.env && node scripts/smoke-stg.mjs`.

## 1. Create the credential and test it

**What to do:** in n8n, create a `Brault API` credential with the stg key and the base
URL above. Use the credential's own test button.

**What should happen:** the test responds OK (green). If it responds with an error,
check that the key does not have extra spaces and that the base URL is exactly
`https://api.stg.brault.app`.

## 2. Trigger with `file.created`

**What to do:** create a new workflow with a `Brault Trigger` node, event
`file.created`, and activate it. Then, on the stg website, upload any file to a
library.

**What should happen:** within a few seconds, a new execution of the workflow appears
in n8n, with an item carrying the data of the file you just uploaded (name, id, etc.).

## 3. Deactivate the workflow and confirm the endpoint disappears

**What to do:** deactivate the workflow from step 2. Then, on the stg website, go to
**Settings → Developers → Webhooks**.

**What should happen:** the endpoint that n8n created (named `n8n · <workflow name>`)
no longer appears in the list.

## 4. File → Get Many with Return All

**What to do:** in a workflow, add a `Brault` node, resource **File**, operation
**Get Many**, and enable the **Return All** option.

**What should happen:** the node returns all the files in the chosen library/folder,
not just the first page (compare the item count with what you see on the website).

## 5. File → Upload from Read/Write Files

**What to do:** chain a **Read/Write Files from Disk** node (or similar) with a
`Brault` node, resource **File**, operation **Upload**, pointing at the binary field
produced by the previous node.

**What should happen:** the node finishes without error and returns the created file;
you see it appear in the destination library on the stg website.

## 6. File → Import From URL with Wait

**What to do:** in a `Brault` node, resource **File**, operation **Import From URL**,
enter a public URL of any file and enable **Wait For Completion**.

**What should happen:** the node waits until the import finishes and returns the
already-created file (not an import still in `queued` or `processing`).

## 7. Comment → Create and see it on the website

**What to do:** in a `Brault` node, resource **Comment**, operation **Create**, on an
existing file, write a test comment and run it. Then open that file on the stg
website.

**What should happen:** the comment appears in the file's comment panel, with the
exact text you put in the node.

## 8. Shared Link → Create with `Access: review` and open the URL

**What to do:** in a `Brault` node, resource **Shared Link**, operation **Create**,
Target Type **File**, and **Access** (`access`) set to `review`, on an existing file.
Copy the returned URL and open it in a new window (or an incognito one).

**What should happen:** the URL opens the file's public review view, without asking
for a login.

## 9. Transfer → Create with an existing file and a binary

**What to do:** in a `Brault` node, resource **Transfer**, operation **Create**, add
at the same time a `file_id` of a file that already exists in Brault and a binary
field (from a previous node such as Read/Write Files). Copy the returned transfer URL
and open it.

**What should happen:** the transfer page shows both files — the one that already
existed in Brault and the one you uploaded as a binary — and both can be downloaded
from there.

## 10. File → Upload picking Library AND Folder from the dropdowns

**What to do:** in a `Brault` node, resource **File**, operation **Upload**, open
**Additional Fields** and pick both **Library** and **Folder** using the "From list"
selector (the dropdown, not "By ID" by hand). Run the node with a valid binary field.

**What should happen:** the node finishes without a 400 error and the file appears in
the exact folder you picked from the dropdown, not in the library root or in another
folder.

## 11. File → Download to a binary field

**What to do:** in a `Brault` node, resource **File**, operation **Download**, with
the `fileId` of an existing file. Leave **Output Binary Field** as `data`.

**What should happen:** the output item carries a `data` binary field with the file's
content; open it with a **Read/Write Files from Disk** node or download it from the
n8n panel and confirm the file opens correctly.

## 12. Board → Query

**What to do:** in a `Brault` node, resource **Board**, operation **Query**, on an
existing board with at least one file.

**What should happen:** the node returns the board's files that match the filter (or
all of them, if you did not set a filter), without error.
