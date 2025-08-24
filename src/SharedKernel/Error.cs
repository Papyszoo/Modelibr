using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SharedKernel
{
    public sealed record Error(string Code, string Message)
    {
        public static readonly Error None = new(string.Empty, string.Empty);
        public static readonly Error NullValue = new("Error.NullValue", "Null value was provided");

        public static implicit operator Result(Error error) => Result.Failure(error);
    }
}
