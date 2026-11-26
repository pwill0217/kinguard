import SwiftUI

struct ActivityTab: View {
    @Environment(AppModel.self) private var model
    @State private var confirmClear = false

    var body: some View {
        List {
            Section {
                Label("Your past checks are saved only on this phone.", systemImage: "lock.fill")
                    .font(.footnote).foregroundStyle(KG.muted)
            }
            if model.history.isEmpty {
                Text("Nothing checked yet.").foregroundStyle(KG.muted)
            } else {
                Section {
                    ForEach(model.history) { r in
                        NavigationLink {
                            ResultView(result: r)
                                .onAppear { model.result = r }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: KG.icon(r.final.verdict)).font(.title2).foregroundStyle(KG.color(r.final.verdict))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(r.final.headline).font(.subheadline.weight(.bold))
                                    Text(r.original).font(.caption).foregroundStyle(KG.muted).lineLimit(1)
                                }
                                Spacer()
                                Text(timeAgo(r.createdAt)).font(.caption).foregroundStyle(KG.muted)
                            }
                        }
                    }
                }
                Section {
                    Button("Delete all past checks", role: .destructive) { confirmClear = true }
                }
            }
        }
        .navigationTitle("Activity")
        .confirmationDialog("Delete all past checks from this phone?", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { model.clearHistory() }
        }
    }
}
