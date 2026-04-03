#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import tempfile


def build_parser():
    parser = argparse.ArgumentParser(description="Create Mail.app draft with attachment")
    parser.add_argument("--recipient", required=True)
    parser.add_argument("--subject", required=True)
    parser.add_argument("--body", required=True)
    parser.add_argument("--attachment", default="")
    return parser


def main():
    args = build_parser().parse_args()
    recipient = args.recipient.strip()
    if not recipient:
        print(json.dumps({"success": False, "error": "收件人不能为空"}, ensure_ascii=False))
        return 1

    attachment = os.path.abspath(args.attachment) if args.attachment else ""
    try:
        with tempfile.TemporaryDirectory(prefix="moss-mail-") as temp_dir:
            subject_path = os.path.join(temp_dir, "subject.txt")
            body_path = os.path.join(temp_dir, "body.txt")

            with open(subject_path, "w", encoding="utf-8") as subject_file:
                subject_file.write(args.subject)
            with open(body_path, "w", encoding="utf-8") as body_file:
                body_file.write(args.body)

            lines = [
                'tell application "Mail"',
                '    set mailRecipient to system attribute "DEMO_SCENE_MAIL_RECIPIENT"',
                '    set subjectPath to system attribute "DEMO_SCENE_MAIL_SUBJECT_FILE"',
                '    set bodyPath to system attribute "DEMO_SCENE_MAIL_BODY_FILE"',
                '    set mailSubject to read POSIX file subjectPath as «class utf8»',
                '    set mailBody to read POSIX file bodyPath as «class utf8»',
                '    set newMsg to make new outgoing message with properties {visible:true, subject:mailSubject, content:mailBody}',
                '    tell newMsg',
                '        make new to recipient at end of to recipients with properties {address:mailRecipient}'
            ]
            if attachment and os.path.exists(attachment):
                lines.extend([
                    '        set mailAttachmentPath to system attribute "DEMO_SCENE_MAIL_ATTACHMENT"',
                    '        try',
                    '            make new attachment with properties {file name:POSIX file mailAttachmentPath} at after the last paragraph',
                    '        end try'
                ])
            lines.extend([
                '    end tell',
                '    activate',
                'end tell'
            ])
            script = "\n".join(lines)

            env = {
                **os.environ,
                "DEMO_SCENE_MAIL_RECIPIENT": recipient,
                "DEMO_SCENE_MAIL_SUBJECT_FILE": subject_path,
                "DEMO_SCENE_MAIL_BODY_FILE": body_path
            }
            if attachment and os.path.exists(attachment):
                env["DEMO_SCENE_MAIL_ATTACHMENT"] = attachment
            subprocess.run(["osascript", "-e", script], check=True, capture_output=True, text=True, env=env)

            print(json.dumps({
                "success": True,
                "recipient": recipient,
                "subject": args.subject,
                "attachment": attachment if attachment and os.path.exists(attachment) else ""
            }, ensure_ascii=False))
            return 0
    except subprocess.CalledProcessError as error:
        print(json.dumps({
            "success": False,
            "error": (error.stderr or error.stdout or str(error)).strip()
        }, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
