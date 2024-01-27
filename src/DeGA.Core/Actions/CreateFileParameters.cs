using DeGA.Core.New;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core.Actions
{
    public record CreateFileParameters(string Path, string Content) 
        : IActionInputParameters;
}
