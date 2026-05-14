#pragma once

#include <map>
#include <string>
#include <vector>

namespace N {
  struct T {};

  void apply(std::vector<T> v);
  void applyNested(std::map<std::string, std::vector<T>> m);
}
