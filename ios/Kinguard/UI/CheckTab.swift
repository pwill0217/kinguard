import PhotosUI
import SwiftUI

struct CheckTab: View {
    @Environment(AppModel.self) private var model
    @Environment(FamilyStore.self) private var family
    @State private var text = ""
    @State private var photo: PhotosPickerItem?
    @State private var image: UIImage?
    @State private var showResult = false
    @FocusState private var focused: Bool

    private let samples: [(String, String)] = [
        ("\"Grandson in jail\"", "Grandma it's me Jake. I'm in trouble, I got in a car accident and they arrested me. I need $2,500 for bail right away. My lawyer Daniel Brooks will call you from 415-555-0182. Please don't tell Mom and Dad. He said you can pay with Target gift cards, read him the numbers on the back."),
        ("Fake package text", "USPS: Your parcel 9400111899223 could not be delivered due to an incomplete address. Pay the $1.99 redelivery fee within 24 hours or it will be returned: https://usps-redelivery-help.top/track?id=MARGARET.HILL@gmail.com"),
        ("Fake Amazon alert", "Dear Customer, Unusual sign-in activity was detected on your Amazon account. Your account has been locked. Verify your identity and payment information immediately at http://amaz0n-account-secure.com/verify. Card ending 4417. Amazon Security Team"),
        ("Real doctor reminder", "Hi Margaret, this is Lakeside Family Medicine reminding you of your appointment with Dr. Patel on Thursday at 10:30 AM. Please arrive 10 minutes early and bring your insurance card. Reply C to confirm."),
    ]

    private var busy: Bool { model.stage != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Is this a scam?").font(.largeTitle.weight(.heavy)).foregroundStyle(KG.ink)
                    Text("Paste a text, email or anything you're unsure about.").foregroundStyle(KG.muted)
                }

                VStack(alignment: .leading, spacing: 10) {
                    TextField("Paste the message here…", text: $text, axis: .vertical)
                        .lineLimit(6...12)
                        .focused($focused)
                        .disabled(busy)
                    if let image {
                        HStack {
                            Image(uiImage: image).resizable().scaledToFit().frame(height: 72)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                            Button("Remove", role: .destructive) { self.image = nil; photo = nil }
                                .font(.footnote.weight(.bold))
                        }
                    }
                    Divider()
                    HStack {
                        PhotosPicker(selection: $photo, matching: .images) {
                            Label("Screenshot", systemImage: "photo")
                        }
                        .buttonStyle(SoftButtonStyle())
                        PasteButton(payloadType: String.self) { strings in
                            if let s = strings.first { text = s }
                        }
                        .labelStyle(.titleAndIcon)
                        .buttonBorderShape(.roundedRectangle)
                        .tint(KG.brand)
                        Spacer()
                    }
                    Label("Personal details are hidden before anything leaves this phone", systemImage: "lock.fill")
                        .font(.caption).foregroundStyle(KG.muted)
                }
                .card()

                Button {
                    focused = false
                    Task {
                        await model.check(text: text, image: image, family: family)
                        if model.result != nil && model.errorMessage == nil { showResult = true }
                    }
                } label: {
                    Text(busy ? "Checking…" : "Check it")
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(busy || (text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && image == nil))

                if let stage = model.stage {
                    StagesView(current: stage, hasImage: image != nil).card()
                }
                if let err = model.errorMessage {
                    Text(err).foregroundStyle(KG.bad).font(.subheadline.weight(.semibold))
                }

                if !busy {
                    Text("Try an example").font(.footnote).foregroundStyle(KG.muted)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(samples, id: \.0) { s in
                                Button(s.0) { text = s.1 }
                                    .buttonStyle(SoftButtonStyle(tint: KG.ink, fill: .white))
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .background(KG.bg)
        .toolbar { TopBar(title: "Kinguard", status: model.deviceAI) }
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showResult) {
            if let r = model.result { ResultView(result: r) }
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) {
                    image = img
                }
            }
        }
    }
}

struct StagesView: View {
    let current: Stage
    let hasImage: Bool

    var body: some View {
        let all: [Stage] = (hasImage ? [.reading] : []) + [.redacting, .screening, .deep]
        let idx = all.firstIndex(of: current) ?? 0
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(all.enumerated()), id: \.offset) { i, s in
                HStack(spacing: 10) {
                    if i < idx {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(KG.safe)
                    } else if i == idx {
                        ProgressView().controlSize(.small).tint(KG.brand)
                    } else {
                        Image(systemName: "circle").foregroundStyle(KG.line)
                    }
                    Text(s.rawValue).foregroundStyle(i <= idx ? KG.ink : KG.muted).font(.subheadline.weight(.semibold))
                }
            }
        }
    }
}
