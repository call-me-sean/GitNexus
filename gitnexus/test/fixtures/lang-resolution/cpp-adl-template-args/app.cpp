#include "audit.h"

namespace app {
  void run() {
    std::vector<N::T> v;
    apply(v);
  }

  void runNested() {
    std::map<std::string, std::vector<N::T>> m;
    applyNested(m);
  }
}
